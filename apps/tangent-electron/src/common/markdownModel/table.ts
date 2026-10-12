import type NoteParser from './NoteParser'
import DocumentFeeder from './DocumentFeeder'
import { lineToText } from 'common/typewriterUtils'
import { type ParsingContext, ParsingContextType } from './parsingContext'

export type TableData = {
	id: number
	rowType: 'data' | 'separator'
	rawContent: string
}

export type TableParsingContext = ParsingContext & {
	id: number
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

export function parseTableBlock(char: string, parser: NoteParser): boolean {
	if (char !== '|' || !parser.isStartOfContent) return false
	const { feed, builder } = parser
	const context: TableParsingContext = {
		type: ParsingContextType.Block,
		indent: parser.getCurrentIndent().indent,
		id: builder.lines.length + (feed instanceof DocumentFeeder ? feed.startLine : 0),
		programs: [parseTableRow]
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
	const cells = matchTableRow(rawContent)
	parser.lineData.table = {
		id: context.id,
		rowType: isSeparatorRow(cells) ? 'separator' : 'data',
		rawContent
	} satisfies TableData
	feed.getLineText(feed.index, true)
	parser.commitSpan(null, 0)
	// Leave the feed on the last character so the outer loop commits the newline.
	feed.next(-1)
	return true
}
