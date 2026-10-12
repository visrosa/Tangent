import { eastAsianWidth } from 'get-east-asian-width'
import type { TableAlignment, TableModel, TableRow } from './tableModel'

type GridCharacter = { text: string, offset: number }
export type TableFragment = { markdown: string, contentType: 'inline' | 'block', offsets: number[] }
type Rectangle = { top: number, bottom: number, left: number, right: number }

function characterGrid(line: string, offset: number): GridCharacter[] {
	const result: GridCharacter[] = []
	let pending = ''
	let pendingOffset = offset
	for (const char of line) {
		if (/^[\p{Mark}\p{Cf}]$/u.test(char)) {
			if (!pending) pendingOffset = offset
			pending += char
		}
		else {
			result.push({ text: pending + char, offset: pending ? pendingOffset : offset })
			if (eastAsianWidth(char.codePointAt(0), { ambiguousAsWide: false }) === 2) result.push(null)
			pending = ''
		}
		offset += char.length
	}
	if (pending) result.push({ text: pending, offset: pendingOffset })
	return result
}

function border(line: string, marker: '-' | '='): { positions: number[], alignment: TableAlignment[] } | null {
	if (!new RegExp('^\\+(?::?' + marker + '+:?\\+)+$').test(line)) return null
	const positions = Array.from(line.matchAll(/\+/g), match => match.index)
	return {
		positions,
		alignment: positions.slice(1).map((end, index) => {
			const start = positions[index]
			return line[start + 1] === ':' ? line[end - 1] === ':' ? 'center' : 'left' : line[end - 1] === ':' ? 'right' : null
		})
	}
}

function cellFragment(grid: GridCharacter[][], cell: Rectangle): TableFragment {
	const lines: { text: string, offsets: number[], endOffset: number }[] = []
	for (let row = cell.top + 1; row < cell.bottom; row++) {
		let text = ''
		const offsets: number[] = []
		for (let column = cell.left + 1; column < cell.right; column++) {
			const char = grid[row][column]
			if (!char) continue
			text += char.text
			for (let index = 0; index < char.text.length; index++) offsets.push(char.offset + index)
		}
		const end = text.trimEnd().length
		lines.push({ text: text.slice(0, end), offsets: offsets.slice(0, end), endOffset: end ? offsets[end - 1] + 1 : grid[row][cell.left]?.offset + 1 })
	}
	// Pandoc removes one common padding space, preserving block indentation.
	const padded = lines.every(line => !line.text || line.text.startsWith(' '))
	if (padded) for (const line of lines) {
		if (line.text) { line.text = line.text.slice(1); line.offsets.shift() }
	}
	while (lines.length && !lines[0].text) lines.shift()
	while (lines.length && !lines.at(-1).text) lines.pop()
	let markdown = ''
	const offsets: number[] = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		if (index) {
			markdown += '\n'
			offsets.push(lines[index - 1].endOffset)
		}
		markdown += line.text
		offsets.push(...line.offsets)
	}
	offsets.push(lines.at(-1)?.endOffset ?? 0)
	return { markdown, contentType: 'block', offsets }
}

/** Read one grid-table source block, retaining offsets for indexing cell Markdown. */
export function readGridTable(source: string): { model: TableModel, fragments: TableFragment[], lineCount: number } | null {
	const sourceLines = source.split('\n')
	let first = 0
	let caption: TableFragment
	const readCaption = (index: number) => {
		const match = /^\s*(?::|Table:)\s+(.+)$/.exec(sourceLines[index] ?? '')
		if (!match) return null
		const start = sourceLines.slice(0, index).reduce((total, line) => total + line.length + 1, 0) + sourceLines[index].length - match[1].length
		return { markdown: match[1], contentType: 'inline' as const, offsets: Array.from({ length: match[1].length + 1 }, (_, offset) => start + offset) }
	}
	caption = readCaption(0)
	if (caption) {
		first++
		while (sourceLines[first]?.trim() === '') first++
	}
	const top = sourceLines[first]?.trimEnd()
	if (!top) return null
	const indent = top.length - top.trimStart().length
	if (indent > 3 || top.slice(0, indent).includes('\t')) return null
	const firstBorder = border(top.slice(indent), '-')
	if (!firstBorder) return null
	const raw: string[] = []
	const grid: GridCharacter[][] = []
	let offset = sourceLines.slice(0, first).reduce((total, line) => total + line.length + 1, 0)
	let end = first
	while (end < sourceLines.length) {
		const line = sourceLines[end]
		if (line.slice(0, indent) !== ' '.repeat(indent) || !/^[+|]/.test(line.slice(indent))) break
		raw.push(line.slice(indent).trimEnd())
		grid.push(characterGrid(raw.at(-1), offset + indent))
		offset += line.length + 1
		end++
	}
	if (grid.length < 2) return null
	const width = Math.max(...grid.map(line => line.length))
	const separators = raw.flatMap((line, index) => {
		const match = border(line, '=')
		return match ? [{ index, ...match }] : []
	})
	const normalized = new Set([0, ...separators.map(separator => separator.index)])
	const at = (row: number, column: number) => {
		const char = grid[row]?.[column]?.text
		return normalized.has(row) && (char === ':' || char === '=') ? '-' : char
	}
	const rows = new Set([0])
	const columns = new Set([0])
	const cells: Rectangle[] = []
	const corners = [[0, 0]]
	const visited = new Set<string>()
	while (corners.length) {
		corners.sort((a, b) => a[0] - b[0] || a[1] - b[1])
		const [top, left] = corners.shift()
		const key = top + ':' + left
		if (visited.has(key)) continue
		visited.add(key)
		let cell: Rectangle
		const encounteredColumns = new Set<number>()
		const encounteredRows = new Set<number>()
		for (let right = left + 1; right < width && !cell; right++) {
			const char = at(top, right)
			if (char === '-') continue
			if (char !== '+') break
			encounteredColumns.add(right)
			for (let bottom = top + 1; bottom < grid.length; bottom++) {
				const edge = at(bottom, right)
				if (edge === '+') {
					encounteredRows.add(bottom)
					if (at(bottom, left) !== '+') continue
					let closed = true
					for (let column = left + 1; column < right; column++) {
						const edge = at(bottom, column)
						if (edge === '+') encounteredColumns.add(column)
						else if (edge !== '-') { closed = false; break }
					}
					for (let row = top + 1; row < bottom && closed; row++) {
						const edge = at(row, left)
						if (edge === '+') encounteredRows.add(row)
						else if (edge !== '|') closed = false
					}
					if (closed) { cell = { top, bottom, left, right }; break }
				}
				else if (edge !== '|' && right !== width - 1) break
			}
			// Pandoc allows the final column to extend beyond a short right border.
			if (!cell && grid[top][right + 1] === undefined && right < width - 1) {
				for (let bottom = top + 1; bottom < grid.length; bottom++) {
					if (at(bottom, left) !== '+') continue
					let closed = true
					for (let column = left + 1; column < width; column++) {
						const edge = at(bottom, column)
						if (edge !== '+' && edge !== '-' && edge !== undefined) { closed = false; break }
					}
					if (closed) {
						cell = { top, bottom, left, right: width - 1 }
						encounteredRows.add(bottom)
						encounteredColumns.clear()
						encounteredColumns.add(width - 1)
						break
					}
				}
			}
		}
		if (cell) {
			cells.push(cell)
			encounteredRows.forEach(row => rows.add(row))
			encounteredColumns.forEach(column => columns.add(column))
			corners.push([cell.top, cell.right], [cell.bottom, cell.left])
		}
	}
	if (!cells.length) return null
	const rowBorders = [...rows].sort((a, b) => a - b)
	const columnBorders = [...columns].sort((a, b) => a - b)
	const alignment = separators[0]?.alignment ?? firstBorder.alignment
	const model: TableModel = {
		columns: columnBorders.slice(1).map((_, index) => ({ alignment: alignment[index] ?? null })),
		head: [], body: [], foot: []
	}
	const logicalRows: TableRow[] = rowBorders.slice(1).map(() => ({ cells: [] }))
	const occupied = logicalRows.map(() => new Set<number>())
	const fragments: TableFragment[] = []
	for (const cell of cells) {
		const row = rowBorders.indexOf(cell.top)
		const column = columnBorders.indexOf(cell.left)
		const rowSpan = rowBorders.indexOf(cell.bottom) - row
		const columnSpan = columnBorders.indexOf(cell.right) - column
		const fragment = cellFragment(grid, cell)
		fragments.push(fragment)
		logicalRows[row].cells.push({ markdown: fragment.markdown, contentType: 'block', rowSpan, columnSpan })
		for (let r = row; r < row + rowSpan; r++) for (let c = column; c < column + columnSpan; c++) occupied[r].add(c)
	}
	// Untraced holes are empty cells, as in Pandoc's grid-table normalization.
	for (let row = 0; row < logicalRows.length; row++) {
		for (let column = 0; column < model.columns.length; column++) {
			if (!occupied[row].has(column)) {
				const position = cells.filter(cell => cell.top === rowBorders[row] && cell.left < columnBorders[column]).length
				logicalRows[row].cells.splice(position, 0, { markdown: '', contentType: 'block', rowSpan: 1, columnSpan: 1 })
			}
		}
	}
	const headerEnd = separators.length ? rowBorders.indexOf(separators[0].index) : 0
	const footerStart = separators.length >= 2 && separators.at(-1).index === rowBorders.at(-1)
		? rowBorders.indexOf(separators.at(-2).index) : logicalRows.length
	model.head = logicalRows.slice(0, Math.max(0, headerEnd))
	model.body = logicalRows.slice(Math.max(0, headerEnd), footerStart)
	model.foot = logicalRows.slice(footerStart)
	if (model.head.length === 1 && model.head[0].cells.every(cell => !cell.markdown && cell.rowSpan === 1 && cell.columnSpan === 1)) model.head = []
	if (!caption) {
		let after = end
		while (sourceLines[after]?.trim() === '') after++
		caption = readCaption(after)
		if (caption) end = after + 1
	}
	if (caption) {
		model.caption = { markdown: caption.markdown, contentType: 'inline' }
		fragments.push(caption)
	}
	return { model, fragments, lineCount: end }
}

export function parseGridTable(source: string): TableModel | null {
	const result = readGridTable(source)
	return result && !source.split('\n').slice(result.lineCount).some(line => line.trim()) ? result.model : null
}
