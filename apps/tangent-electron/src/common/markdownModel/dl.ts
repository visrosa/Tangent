import type NoteParser from './NoteParser'
import type { ListDefinition } from './list'
import { getInlineId } from './inline'
import DocumentFeeder from './DocumentFeeder'
import { lineToText } from '../typewriterUtils'

export type DlLineData = {
	role: 'term' | 'value'
	glyph?: ListDefinition
	hasDef?: boolean
	rootIndent?: string
	termIndent?: string
}

export type DlSeparatorData = true

export type ParentDlTerm = {
	rootIndent: string
	termIndent: string
}

type DlSeparatorMatch = {
	/** Offset of the separator's leading whitespace within the matched line */
	index: number
	hasDef: boolean
}

const termSeparatorIndices = new WeakMap<NoteParser, number>()

function findClosingRun(text: string, start: number, marker: string) {
	const end = text.indexOf(marker, start + marker.length)
	return end < 0 ? text.length : end + marker.length
}

function findUnescaped(text: string, marker: string, start: number) {
	for (let index = start; index < text.length; index++) {
		if (text[index] === '\\') {
			index++
			continue
		}
		if (text.startsWith(marker, index)) return index
	}
	return -1
}

/**
 * Finds the first description separator that the inline parser can consume.
 * Inline code, links, HTML, and braced annotations consume their own contents
 * before the description-list program gets a chance to inspect them.
 */
function findDlSeparator(content: string) {
	for (let index = 0; index < content.length; index++) {
		const char = content[index]

		if (char === '\\') {
			index++
			continue
		}

		if (char === '`') {
			let runLength = 1
			while (content[index + runLength] === '`') runLength++
			const marker = '`'.repeat(runLength)
			index = findClosingRun(content, index, marker) - 1
			continue
		}

		if (char === '$') {
			const marker = content[index + 1] === '$' ? '$$' : '$'
			const contentStart = index + marker.length
			if (contentStart < content.length && !/\s/.test(content[contentStart])) {
				const end = findUnescaped(content, marker, contentStart)
				if (end >= 0 && end > contentStart && !/\s/.test(content[end - 1])) {
					index = end + marker.length - 1
					continue
				}
			}
		}

		if (content.startsWith('[[', index)) {
			index = findClosingRun(content, index, ']]') - 1
			continue
		}

		if (char === '[') {
			const labelEnd = findUnescaped(content, ']', index + 1)
			if (labelEnd >= 0) {
				if (content[labelEnd + 1] === '(') {
					const targetEnd = findUnescaped(content, ')', labelEnd + 2)
					index = targetEnd >= 0 ? targetEnd : content.length - 1
				}
				else {
					index = labelEnd
				}
				continue
			}
		}

		if (char === '{') {
			const end = findUnescaped(content, '}', index + 1)
			if (end >= 0) {
				index = end
				continue
			}
		}

		if (char === '<') {
			const end = content.indexOf('>', index + 1)
			if (end >= 0) {
				index = end
				continue
			}
		}

		if ((char === ' ' || char === '\t')
			&& content[index + 1] === ':'
			&& content[index + 2] === ':'
			&& (content[index + 3] === undefined || /[ \t]/.test(content[index + 3]))) {
			return index
		}
	}

	return -1
}

export function matchDlSeparator(line: string, listDetail: ListDefinition | null): DlSeparatorMatch | null {
	if (!listDetail) return null
	const contentStart = listDetail.indent.length + listDetail.glyph.length + 1
	const content = line.slice(contentStart)
	const separator = findDlSeparator(content)
	if (separator < 0) return null

	return {
		index: contentStart + separator,
		hasDef: content.slice(separator + 3).trim().length > 0
	}
}

/**
 * Only the first top-level separator on a term line separates; any later
 * ` :: ` is literal definition text.
 */
export function setDlTermSeparator(parser: NoteParser, feedIndex: number) {
	termSeparatorIndices.set(parser, feedIndex)
}

export function isStartOfBlockContent(parser: NoteParser) {
	return parser.isStartOfContent || (parser.lineData.blockquote
		&& /^[ \t]*(> ?)+$/.test(parser.feed.text.slice(parser.lineStart, parser.feed.index)))
}

export function setDlLineData(parser: NoteParser, dl: DlLineData) {
	// Typewriter selects the first registered line attribute. Move blockquote
	// behind dl so the composite dl renderer can preserve both structures.
	const blockquote = parser.lineData.blockquote
	if (blockquote !== undefined) delete parser.lineData.blockquote
	parser.lineData.dl = dl
	if (blockquote !== undefined) parser.lineData.blockquote = blockquote
}

export function matchDlValueMarker(line: string) {
	return /^[ \t]*:[ \t]/.exec(line)
}

export function injectDlChildren(parser: NoteParser) {
	const { feed } = parser
	if (!(feed instanceof DocumentFeeder)) return
	const indent = parser.getCurrentIndent().indent
	feed.injectAdjacentLinesWhile(line => {
		const nextIndent = line.attributes.indent?.indent ?? ''
		if ((line.attributes.blockquote ?? 0) !== (parser.lineData.blockquote ?? 0)) return false
		const marker = matchDlValueMarker(lineToText(line).replace(/^[ \t]*(> ?)+/, ''))
		return (nextIndent.length > indent.length && !!(line.attributes.list || line.attributes.dl || marker))
			|| (nextIndent === indent && !!marker)
	})
}

export function findParentDlTerm(
	parser: NoteParser,
	currentIndent: string,
	requireBare = true,
	allowSameIndent = false
): ParentDlTerm | null {
	for (let index = parser.builder.lines.length - 1; index >= 0; index--) {
		const previous = parser.builder.lines[index]
		if (previous.attributes.empty || previous.attributes.whitespace) return null
		if ((previous.attributes.blockquote ?? 0) !== (parser.lineData.blockquote ?? 0)) return null

		const previousIndent = previous.attributes.indent?.indent ?? ''
		const dl = previous.attributes.dl as DlLineData | undefined
		if (previousIndent.length > currentIndent.length) continue
		if (previousIndent === currentIndent) {
			if (!allowSameIndent || dl?.role === 'value') continue
		}
		else if (previousIndent.length === currentIndent.length) return null
		if (dl?.role === 'term' && (!requireBare || dl.hasDef === false)) {
			return {
				rootIndent: dl.rootIndent ?? previousIndent,
				termIndent: previousIndent
			}
		}
		return null
	}

	return null
}

export function parseDlBlock(_char: string, parser: NoteParser): boolean {
	if (!isStartOfBlockContent(parser)) return false
	const { feed } = parser
	const line = feed.getLineText()
	const indent = parser.getCurrentIndent().indent
	const marker = matchDlValueMarker(line)
	if (marker) {
		const parent = findParentDlTerm(parser, indent, true, true)
		if (!parent) return false
		setDlLineData(parser, { role: 'value', ...parent })
		feed.nextByLength(marker[0].length - 1)
		parser.commitSpan({ line_format: 'dl', hidden: true })
		return true
	}

	const separator = findDlSeparator(line)
	if (separator < 0 || !line.slice(0, separator).trim() || line.slice(separator + 3).trim()) return false
	const parent = findParentDlTerm(parser, indent, false)
	setDlLineData(parser, {
		role: 'term', hasDef: false,
		rootIndent: parent?.rootIndent ?? indent,
		termIndent: parent?.termIndent
	})
	setDlTermSeparator(parser, feed.index + separator)
	injectDlChildren(parser)
	return false
}

export function parseDlSeparator(char: string, parser: NoteParser): boolean {
	if (char !== ' ' && char !== '\t') return false

	const dl = parser.lineData.dl as DlLineData | undefined
	if (dl?.role !== 'term') return false

	const { feed } = parser
	if (feed.index !== termSeparatorIndices.get(parser)) return false

	const following = feed.text[feed.index + 3]
	parser.commitSpan(null, 0)
	const start = feed.index

	// Include one separating space in the hidden span when a definition follows,
	// but never consume the newline ending a bare term.
	feed.nextByLength(following === ' ' || following === '\t' ? 3 : 2)
	parser.commitSpan({
		dl_sep: true,
		hiddenGroup: getInlineId(parser, start, feed.index + feed.currentStepLength)
	})

	return true
}
