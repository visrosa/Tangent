import type NoteParser from './NoteParser'
import type { ListDefinition } from './list'
import { getInlineId } from './inline'
import DocumentFeeder from './DocumentFeeder'
import { lineToText } from '../typewriterUtils'

export type AssociationListLineData = {
	role: 'term' | 'value'
	glyph?: ListDefinition
	hasValue?: boolean
	rootIndent?: string
	termIndent?: string
}

export type AssociationListSeparatorData = true

export type ParentAssociationListTerm = {
	rootIndent: string
	termIndent: string
}

type AssociationListSeparatorMatch = {
	/** Offset of the separator's leading whitespace within the matched line */
	index: number
	hasValue: boolean
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
 * Finds the first association separator that the inline parser can consume.
 * Inline code, links, HTML, and braced annotations consume their own contents
 * before the association-list program gets a chance to inspect them.
 */
function findAssociationListSeparator(content: string) {
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

export function matchAssociationListSeparator(line: string, listDetail: ListDefinition | null): AssociationListSeparatorMatch | null {
	if (!listDetail) return null
	const contentStart = listDetail.indent.length + listDetail.glyph.length + 1
	const content = line.slice(contentStart)
	const separator = findAssociationListSeparator(content)
	if (separator < 0) return null

	return {
		index: contentStart + separator,
		hasValue: content.slice(separator + 3).trim().length > 0
	}
}

/**
 * Only the first top-level separator on a term line separates; any later
 * ` :: ` is literal value text.
 */
export function setAssociationListTermSeparator(parser: NoteParser, feedIndex: number) {
	termSeparatorIndices.set(parser, feedIndex)
}

export function isStartOfBlockContent(parser: NoteParser) {
	return parser.isStartOfContent || (parser.lineData.blockquote
		&& /^[ \t]*(> ?)+$/.test(parser.feed.text.slice(parser.lineStart, parser.feed.index)))
}

export function setAssociationListLineData(parser: NoteParser, associationList: AssociationListLineData) {
	// Typewriter selects the first registered line attribute. Move blockquote
	// behind associationList so the composite associationList renderer can preserve both structures.
	const blockquote = parser.lineData.blockquote
	if (blockquote !== undefined) delete parser.lineData.blockquote
	parser.lineData.associationList = associationList
	if (blockquote !== undefined) parser.lineData.blockquote = blockquote
}

export function matchAssociationListValueMarker(line: string) {
	return /^[ \t]*:[ \t]/.exec(line)
}

export function injectAssociationListChildren(parser: NoteParser) {
	const { feed } = parser
	if (!(feed instanceof DocumentFeeder)) return
	const indent = parser.getCurrentIndent().indent
	feed.injectAdjacentLinesWhile(line => {
		const nextIndent = line.attributes.indent?.indent ?? ''
		if ((line.attributes.blockquote ?? 0) !== (parser.lineData.blockquote ?? 0)) return false
		const marker = matchAssociationListValueMarker(lineToText(line).replace(/^[ \t]*(> ?)+/, ''))
		return (nextIndent.length > indent.length && !!(line.attributes.list || line.attributes.associationList || marker))
			|| (nextIndent === indent && !!marker)
	})
}

export function findParentAssociationListTerm(
	parser: NoteParser,
	currentIndent: string,
	requireBare = true,
	allowSameIndent = false
): ParentAssociationListTerm | null {
	for (let index = parser.builder.lines.length - 1; index >= 0; index--) {
		const previous = parser.builder.lines[index]
		if (previous.attributes.empty || previous.attributes.whitespace) return null
		if ((previous.attributes.blockquote ?? 0) !== (parser.lineData.blockquote ?? 0)) return null

		const previousIndent = previous.attributes.indent?.indent ?? ''
		const associationList = previous.attributes.associationList as AssociationListLineData | undefined
		if (previousIndent.length > currentIndent.length) continue
		if (previousIndent === currentIndent) {
			if (!allowSameIndent || associationList?.role === 'value') continue
		}
		else if (previousIndent.length === currentIndent.length) return null
		if (associationList?.role === 'term' && (!requireBare || associationList.hasValue === false)) {
			return {
				rootIndent: associationList.rootIndent ?? previousIndent,
				termIndent: previousIndent
			}
		}
		return null
	}

	return null
}

export function parseAssociationListBlock(_char: string, parser: NoteParser): boolean {
	if (!isStartOfBlockContent(parser)) return false
	const { feed } = parser
	const line = feed.getLineText()
	const indent = parser.getCurrentIndent().indent
	const marker = matchAssociationListValueMarker(line)
	if (marker) {
		const parent = findParentAssociationListTerm(parser, indent, true, true)
		if (!parent) return false
		setAssociationListLineData(parser, { role: 'value', ...parent })
		feed.nextByLength(marker[0].length - 1)
		parser.commitSpan({ line_format: 'associationList', hidden: true })
		return true
	}

	const separator = findAssociationListSeparator(line)
	if (separator < 0 || !line.slice(0, separator).trim() || line.slice(separator + 3).trim()) return false
	const parent = findParentAssociationListTerm(parser, indent, false)
	setAssociationListLineData(parser, {
		role: 'term', hasValue: false,
		rootIndent: parent?.rootIndent ?? indent,
		termIndent: parent?.termIndent
	})
	setAssociationListTermSeparator(parser, feed.index + separator)
	injectAssociationListChildren(parser)
	return false
}

export function parseAssociationListSeparator(char: string, parser: NoteParser): boolean {
	if (char !== ' ' && char !== '\t') return false

	const associationList = parser.lineData.associationList as AssociationListLineData | undefined
	if (associationList?.role !== 'term') return false

	const { feed } = parser
	if (feed.index !== termSeparatorIndices.get(parser)) return false

	const following = feed.text[feed.index + 3]
	parser.commitSpan(null, 0)
	const start = feed.index

	// Include one separating space in the hidden span when a value follows,
	// but never consume the newline ending a bare term.
	feed.nextByLength(following === ' ' || following === '\t' ? 3 : 2)
	parser.commitSpan({
		association_separator: true,
		hiddenGroup: getInlineId(parser, start, feed.index + feed.currentStepLength)
	})

	return true
}
