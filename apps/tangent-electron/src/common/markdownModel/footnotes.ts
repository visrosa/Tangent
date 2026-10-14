import type { Line } from '@typewriter/document'
import { lineToText } from 'common/typewriterUtils'
import DocumentFeeder from './DocumentFeeder'
import { getInlineId } from './inline'
import type NoteParser from './NoteParser'
import { parseMarkdown, type MarkdownParsingOptions } from './parser'

export type FootnoteData = { key: string, definition?: boolean }
export type FootnoteDefinition = { key: string, indent: number, start: boolean }
export type ResolvedFootnote = {
	key: string
	number?: number
	start: number
	text: string
	references: number[]
}

const marker = /^\[\^([^\s\[\]\\]+)\]/u
export function normalizeFootnoteKey(key: string) { return key.toLowerCase() }

export function parseFootnoteDefinition(char: string, parser: NoteParser): boolean {
	if (char !== '[' || !parser.isStartOfContent) return false
	const { feed } = parser
	const match = feed.text.slice(feed.index).match(marker)
	if (!match || feed.text[feed.index + match[0].length] !== ':') return false
	parser.lineData.footnoteDefinition = {
		key: normalizeFootnoteKey(match[1]),
		indent: parser.getCurrentIndent().indentSize ?? 0,
		start: true
	} satisfies FootnoteDefinition
	if (feed instanceof DocumentFeeder) {
		feed.injectAdjacentLinesWhile(line => {
			const text = lineToText(line)
			return !!line.attributes.footnoteDefinition || !text.trim() || /^( {4}|\t)/.test(text)
		})
	}
	commitMarker(parser, match[1], match[0].length + 1, true)
	return true
}

export function parseFootnoteReference(char: string, parser: NoteParser): boolean {
	if (char !== '[') return false
	const match = parser.feed.text.slice(parser.feed.index).match(marker)
	if (!match) return false
	commitMarker(parser, match[1], match[0].length, false)
	return true
}

function commitMarker(parser: NoteParser, key: string, length: number, definition: boolean) {
	const { feed } = parser
	const start = feed.index
	parser.commitSpan(null, 0)
	feed.nextByLength(length - 1)
	parser.commitSpan({
		footnote: { key, definition } satisfies FootnoteData,
		hiddenGroup: getInlineId(parser, start, start + length)
	})
}

export function continueFootnoteDefinition(parser: NoteParser) {
	const previous = parser.builder.lines.at(-1)?.attributes.footnoteDefinition as FootnoteDefinition
	if (!previous) return
	const indent = parser.getCurrentIndent().indentSize ?? 0
	if (indent >= previous.indent + 4 || parser.feed.currentChar === '\n') {
		parser.lineData.footnoteDefinition = { ...previous, start: false }
	}
}

export function resolveFootnotes(lines: Line[]): Map<string, ResolvedFootnote> {
	const notes = new Map<string, ResolvedFootnote>()
	let offset = 0
	let current: ResolvedFootnote = null
	for (const line of lines) {
		const definition = line.attributes.footnoteDefinition as FootnoteDefinition
		if (definition?.start) {
			current = null
			if (!notes.has(definition.key)) {
				current = { key: definition.key, start: offset, text: '', references: [] }
				notes.set(definition.key, current)
			}
		}
		else if (!definition) current = null
		if (current) {
			let text = lineToText(line)
			if (definition.start) text = text.replace(/^\s*\[\^[^\]]+\]:[ \t]?/, '')
			else text = text.replace(/^( {4}|\t)/, '')
			current.text += (current.text ? '\n' : '') + text
		}
		offset += line.length
	}
	let number = 0
	offset = 0
	const tables = new Set<object>()
	function reference(key: string, start: number) {
		const note = notes.get(normalizeFootnoteKey(key))
		if (note) {
			note.number ??= ++number
			note.references.push(start)
		}
	}
	for (const line of lines) {
		const table = line.attributes.table
		if (table?.model && !tables.has(table.model)) {
			tables.add(table.model)
			const model = table.model
			const fragments = [model.caption, ...[...model.head, ...model.body, ...(model.foot ?? [])].flatMap(row => row.cells)].filter(Boolean)
			for (const fragment of fragments) {
				const parsed = parseMarkdown(fragment.markdown, { inlineOnly: fragment.contentType === 'inline' } as MarkdownParsingOptions)
				for (const fragmentLine of parsed.lines) {
					let lastGroup: string = null
					for (const op of fragmentLine.content.ops) {
						const data = op.attributes?.footnote as FootnoteData
						const group = op.attributes?.hiddenGroup
						// Table previews select the retained source block, not an editable cell.
						if (data && !data.definition && group !== lastGroup) reference(data.key, offset)
						lastGroup = group
					}
				}
			}
		}
		let position = offset
		let lastGroup: string = null
		for (const op of line.content.ops) {
			const data = op.attributes?.footnote as FootnoteData
			const group = op.attributes?.hiddenGroup
			if (data && !data.definition && (group !== lastGroup || !group)) {
				reference(data.key, position)
			}
			lastGroup = group
			position += typeof op.insert === 'string' ? op.insert.length : op.retain ?? 1
		}
		offset += line.length
	}
	return notes
}
