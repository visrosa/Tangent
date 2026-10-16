import { eastAsianWidth } from 'get-east-asian-width'
import type { TableCell, TableModel } from './tableModel'

function characterWidth(char: string): number {
	return /^[\p{Mark}\p{Cf}]$/u.test(char) ? 0 : eastAsianWidth(char.codePointAt(0), { ambiguousAsWide: false })
}

function displayWidth(text: string): number {
	return Array.from(text).reduce((total, char) => total + characterWidth(char), 0)
}

export function gridTableToMarkdown(model: TableModel): string {
	// The first '=' separator denotes a header; normalize an empty one for headerless feet.
	if (!model.head.length && model.foot.length) {
		model = { ...model, head: [{ cells: model.columns.map(() => ({ markdown: '', contentType: 'block', rowSpan: 1, columnSpan: 1 })) }] }
	}
	const rows = [...model.head, ...model.body, ...model.foot]
	if (!rows.length || !model.columns.length) return ''
	const occupied: TableCell[][] = rows.map(() => [])
	const cells: { cell: TableCell, row: number, column: number, lines: string[] }[] = []
	for (let row = 0; row < rows.length; row++) {
		let column = 0
		for (const cell of rows[row].cells) {
			while (occupied[row][column]) column++
			cells.push({ cell, row, column, lines: cell.markdown.replace(/\t/g, '    ').split('\n') })
			for (let r = row; r < row + cell.rowSpan; r++) {
				for (let c = column; c < column + cell.columnSpan; c++) occupied[r][c] = cell
			}
			column += cell.columnSpan
		}
	}
	const widths = model.columns.map(() => 3)
	const heights = rows.map(() => 1)
	for (const { cell, row, column, lines } of cells) {
		const width = Math.max(...lines.map(displayWidth)) + 2
		const availableWidth = widths.slice(column, column + cell.columnSpan).reduce((a, b) => a + b, cell.columnSpan - 1)
		widths[column + cell.columnSpan - 1] += Math.max(0, width - availableWidth)
		const availableHeight = heights.slice(row, row + cell.rowSpan).reduce((a, b) => a + b, cell.rowSpan - 1)
		heights[row + cell.rowSpan - 1] += Math.max(0, lines.length - availableHeight)
	}
	const boundaries = (sizes: number[]) => sizes.reduce((positions, size) => [...positions, positions.at(-1) + size + 1], [0])
	const x = boundaries(widths)
	const y = boundaries(heights)
	const horizontal = new Set<string>()
	const vertical = new Set<string>()
	const canvas: string[][] = Array.from({ length: y.at(-1) + 1 }, () => Array(x.at(-1) + 1).fill(' '))
	for (const { cell, row, column, lines } of cells) {
		const left = x[column], right = x[column + cell.columnSpan]
		const top = y[row], bottom = y[row + cell.rowSpan]
		for (let c = left; c <= right; c++) {
			horizontal.add(top + ':' + c)
			horizontal.add(bottom + ':' + c)
		}
		for (let r = top; r <= bottom; r++) {
			vertical.add(r + ':' + left)
			vertical.add(r + ':' + right)
		}
		for (let index = 0; index < lines.length; index++) {
			let c = left + 2
			for (const char of lines[index]) {
				const width = characterWidth(char)
				if (!width) canvas[top + index + 1][c - 1] += char
				else {
					canvas[top + index + 1][c] = char
					if (width === 2) canvas[top + index + 1][c + 1] = ''
					c += width
				}
			}
		}
	}
	const sections = new Set<number>()
	if (model.head.length) sections.add(y[model.head.length])
	if (model.foot.length) {
		sections.add(y[model.head.length + model.body.length])
		sections.add(y.at(-1))
	}
	for (let r = 0; r < canvas.length; r++) {
		for (let c = 0; c < canvas[r].length; c++) {
			const h = horizontal.has(r + ':' + c), v = vertical.has(r + ':' + c)
			if (h || v) canvas[r][c] = h && v ? '+' : h ? sections.has(r) ? '=' : '-' : '|'
		}
	}
	// A row covered entirely by continuing spans still needs a row-boundary marker.
	for (const row of y.slice(1, -1)) {
		if (!canvas[row].some((_, column) => horizontal.has(row + ':' + column))) {
			canvas[row][0] = '+'
			canvas[row][x.at(-1)] = '+'
		}
	}
	const alignmentLine = model.head.length ? y[model.head.length] : 0
	for (const column of x) canvas[alignmentLine][column] = '+'
	for (let column = 0; column < model.columns.length; column++) {
		const alignment = model.columns[column].alignment
		if (alignment === 'left' || alignment === 'center') canvas[alignmentLine][x[column] + 1] = ':'
		if (alignment === 'right' || alignment === 'center') canvas[alignmentLine][x[column + 1] - 1] = ':'
	}
	let result = canvas.map(line => line.join('')).join('\n')
	if (model.caption) result += '\n\n: ' + model.caption.markdown.replace(/\n/g, ' ')
	return result
}
