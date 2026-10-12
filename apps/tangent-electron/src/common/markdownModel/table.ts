import type NoteParser from './NoteParser'
import DocumentFeeder from './DocumentFeeder'
import { lineToText } from 'common/typewriterUtils'
import { type ParsingContext, ParsingContextType } from './parsingContext'
import type { TableModel, TableRow } from './tableModel'

export type { TableModel, TableRow, TableCell, TableAlignment } from './tableModel'

export type TableData = {
	id: number
	source: string
	model: TableModel
}

export type TableParsingContext = ParsingContext & {
	data: TableData
	rows: string[]
}

export function matchTableRow(line: string): string[] | null {
	const content = line.trim()
	if (!content.startsWith('|')) return null
	const cells: string[] = []
	let cell = ''
	let backslashes = 0
	for (let index = 1; index < content.length; index++) {
		const char = content[index]
		if (char === '|' && backslashes % 2 === 0) {
			cells.push(cell.trim())
			cell = ''
		}
		else {
			cell += char
		}
		backslashes = char === '\\' ? backslashes + 1 : 0
	}
	// A final unescaped pipe closes the last cell rather than adding a new one.
	if (cell || !content.endsWith('|') || backslashes) cells.push(cell.trim())
	if (!cells.length) cells.push('')
	return cells
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
			markdown: (cells[column] ?? '').replace(/(\\+)\|/g, (match, slashes) =>
				(slashes.length % 2 ? slashes.slice(1) : slashes) + '|'),
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
	context.rows.push(rawContent)
	parser.lineData.table = context.data
	parser.lineData.hidden = true
	feed.getLineText(feed.index, true)
	parser.commitSpan({ hidden: true, line_format: 'table' }, 0)
	// Leave the feed on the last character so the outer loop commits the newline.
	feed.next(-1)
	return true
}
