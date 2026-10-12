import NoteParser from './NoteParser'
import CharacterFeeder from './CharacterFeeder'
import DocumentFeeder from './DocumentFeeder'
import { lineToText } from 'common/typewriterUtils'
import { type ParsingContext, ParsingContextType } from './parsingContext'
import type { TableModel, TableRow } from './tableModel'
import { readGridTable } from './gridTable'

export type { TableModel, TableRow, TableCell, TableAlignment } from './tableModel'
export { parseGridTable } from './gridTable'

export type TableData = {
	id: number
	source: string
	model: TableModel
	filepath?: string
}

export type TableParsingContext = ParsingContext & {
	data: TableData
	rows: string[]
}

function splitPipeRow(line: string): { raw: string, offset: number }[] | null {
	const content = line.trim()
	if (!content.startsWith('|')) return null
	const leading = line.length - line.trimStart().length
	const cells: { raw: string, offset: number }[] = []
	let cell = ''
	let cellStart = 1
	let backslashes = 0
	const pushCell = () => cells.push({
		raw: cell.trim(),
		offset: leading + cellStart + cell.length - cell.trimStart().length
	})
	for (let index = 1; index < content.length; index++) {
		const char = content[index]
		if (char === '|' && backslashes % 2 === 0) {
			pushCell()
			cell = ''
			cellStart = index + 1
		}
		else {
			cell += char
		}
		backslashes = char === '\\' ? backslashes + 1 : 0
	}
	// A final unescaped pipe closes the last cell rather than adding a new one.
	if (cell || !content.endsWith('|') || backslashes) pushCell()
	if (!cells.length) pushCell()
	return cells
}

export function matchTableRow(line: string): string[] | null {
	return splitPipeRow(line)?.map(cell => cell.raw) ?? null
}

function decodePipeCell(raw: string) {
	let text = ''
	const offsets: number[] = []
	for (let index = 0; index < raw.length; index++) {
		if (raw[index] === '\\') {
			let end = index
			while (raw[end] === '\\') end++
			if (raw[end] === '|' && (end - index) % 2) {
				for (; index < end - 1; index++) {
					offsets.push(index)
					text += raw[index]
				}
				index = end
			}
		}
		offsets.push(index)
		text += raw[index]
	}
	offsets.push(raw.length)
	return { text, offsets }
}

export function isSeparatorRow(cells: string[]): boolean {
	return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell))
}

export function parseColumnAlignment(cells: string[]): ('left' | 'center' | 'right' | null)[] {
	return cells.map(cell => cell.startsWith(':')
		? cell.endsWith(':') ? 'center' : 'left'
		: cell.endsWith(':') ? 'right' : null)
}

export function parsePipeTable(source: string): TableModel | null {
	const rows = source.split('\n').map(matchTableRow)
	if (!rows.length || rows.some(row => row === null)) return null
	const separator = rows.findIndex(isSeparatorRow)
	const width = rows[0].length
	const alignment = separator === -1 ? [] : parseColumnAlignment(rows[separator])
	const toRow = (cells: string[]): TableRow => ({
		cells: Array.from({ length: width }, (_, column) => ({
			// Pipe escapes belong to the table syntax, including inside code spans.
			markdown: decodePipeCell(cells[column] ?? '').text,
			contentType: 'inline',
			rowSpan: 1,
			columnSpan: 1
		}))
	})
	return {
		columns: Array.from({ length: width }, (_, column) => ({ alignment: alignment[column] ?? null })),
		head: separator === -1 ? [] : rows.slice(0, separator).map(toRow),
		body: rows.slice(separator + 1).map(toRow),
		foot: []
	}
}

export function parseTableBlock(char: string, parser: NoteParser): boolean {
	if (parser.isStartOfContent && (char === '+' || char === ':' || char === 'T')) {
		const { feed } = parser
		const firstLine = feed.getLineText(parser.lineStart)
		if (!/^\s*(?:\+(?::?-+:?\+)+\s*$|(?::|Table:)\s+\S)/.test(firstLine)) return false
		if (feed instanceof DocumentFeeder) {
			// A newly inserted opening border may precede unformatted grid source.
			let index = feed.endLine
			const captionBefore = /^\s*(?::|Table:)\s+/.test(firstLine)
			feed.injectAdjacentLinesWhile(line => {
				index++
				const text = lineToText(line)
				if (/^\s*[+|]|^\s*(?::|Table:)\s+/.test(text)) return true
				if (text.trim()) return false
				let next = index + 1
				while (next < feed.doc.lines.length && !lineToText(feed.doc.lines[next]).trim()) next++
				const after = feed.doc.lines[next] && lineToText(feed.doc.lines[next])
				return !!after && (/^\s*(?::|Table:)\s+/.test(after) || (captionBefore && /^\s*\+/.test(after) && !/(?:^|\n)\s*\+/.test(feed.text)))
			})
		}
		const sourceStart = parser.lineStart
		const grid = readGridTable(feed.text.slice(sourceStart))
		if (grid) {
			const source = feed.text.slice(sourceStart).split('\n').slice(0, grid.lineCount).join('\n')
			const data: TableData = {
				id: parser.builder.lines.length + (feed instanceof DocumentFeeder ? feed.startLine : 0),
				source, model: grid.model, filepath: parser.filepath
			}
			for (const fragment of grid.fragments) {
				const parsed = new NoteParser(new CharacterFeeder(fragment.markdown), { ...parser.options, inlineOnly: fragment.contentType === 'inline', asFormatting: false })
				parsed.parse()
				for (const structure of parsed.structure) {
					parser.pushStructure({ ...structure, start: sourceStart + fragment.offsets[structure.start], end: sourceStart + fragment.offsets[structure.end] })
				}
			}
			for (let index = 0; index < grid.lineCount; index++) {
				parser.lineData.table = data
				parser.lineData.hidden = true
				feed.getLineText(feed.index, true)
				parser.commitSpan({ hidden: true, line_format: 'table' }, 0)
				if (index < grid.lineCount - 1) parser.moveNext()
			}
			feed.next(-1)
			return true
		}
	}
	if (char !== '|' || !parser.isStartOfContent) return false
	const { feed, builder } = parser
	const context: TableParsingContext = {
		type: ParsingContextType.Block,
		indent: parser.getCurrentIndent().indent,
		data: {
			id: builder.lines.length + (feed instanceof DocumentFeeder ? feed.startLine : 0),
			source: '',
			model: null
		},
		rows: [],
		programs: [parseTableRow],
		exit: (lastIndex, context: TableParsingContext) => {
			context.data.source = context.rows.join('\n')
			context.data.model = parsePipeTable(context.data.source)
		}
	}
	if (parser.filepath) context.data.filepath = parser.filepath
	if (feed instanceof DocumentFeeder) {
		feed.injectAdjacentLinesWhile(line => matchTableRow(lineToText(line)) !== null)
	}
	parser.pushContext(context)
	return parseTableRow(char, parser, context)
}

function parseTableRow(char: string, parser: NoteParser, context: TableParsingContext): boolean {
	const { feed } = parser
	if (!parser.isStartOfContent) return false
	if (char !== '|') {
		parser.popContext()
		return parser.contexts.at(-1).programs.some(program => program(char, parser, parser.contexts.at(-1)))
	}
	const rawContent = feed.getLineText(parser.lineStart)
	const cells = splitPipeRow(rawContent)
	if (!isSeparatorRow(cells.map(cell => cell.raw))) {
		for (const cell of cells) {
			const decoded = decodePipeCell(cell.raw)
			const fragment = new NoteParser(new CharacterFeeder(decoded.text), { ...parser.options, inlineOnly: true, asFormatting: false })
			fragment.parse()
			// Table escapes change fragment offsets; index entries still refer to the original source.
			for (const structure of fragment.structure) {
				parser.pushStructure({
					...structure,
					start: parser.lineStart + cell.offset + decoded.offsets[structure.start],
					end: parser.lineStart + cell.offset + decoded.offsets[structure.end]
				})
			}
		}
	}
	context.rows.push(rawContent)
	parser.lineData.table = context.data
	parser.lineData.hidden = true
	feed.getLineText(feed.index, true)
	parser.commitSpan({ hidden: true, line_format: 'table' }, 0)
	// Leave the feed on the last character so the outer loop commits the newline.
	feed.next(-1)
	return true
}
