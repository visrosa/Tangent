import type NoteParser from './NoteParser'
import type { ListDefinition } from './list'

export type DlLineData = {
	role: 'term' | 'value'
	glyph: ListDefinition
	hasDef?: boolean
	rootIndent?: string
	termIndent?: string
}

export type DlSeparatorData = {
	/** Keeps decoration-split separator spans from merging with one another. */
	instance?: string
}

export type ParentDlTerm = {
	rootIndent: string
	termIndent: string
}

type DlSeparatorMatch = {
	hasDef: boolean
}

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

		if (char === ' '
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
	const content = line.slice(listDetail.indent.length + listDetail.glyph.length + 1)
	const separator = findDlSeparator(content)
	if (separator < 0) return null

	return {
		hasDef: content.slice(separator + 3).trim().length > 0
	}
}

export function findParentDlTerm(parser: NoteParser, currentIndent: string): ParentDlTerm | null {
	for (let index = parser.builder.lines.length - 1; index >= 0; index--) {
		const previous = parser.builder.lines[index]
		if (previous.attributes.empty || previous.attributes.whitespace) return null

		const previousIndent = previous.attributes.indent?.indent ?? ''
		if (previousIndent.length >= currentIndent.length) continue

		const dl = previous.attributes.dl as DlLineData | undefined
		if (dl?.role === 'term' && dl.hasDef === false) {
			return {
				rootIndent: dl.rootIndent ?? previousIndent,
				termIndent: previousIndent
			}
		}
		return null
	}

	return null
}

export function parseDlSeparator(char: string, parser: NoteParser): boolean {
	if (char !== ' ') return false

	const dl = parser.lineData.dl as DlLineData | undefined
	if (dl?.role !== 'term') return false
	if (parser.builder.spans.some(span => span.attributes?.dl_sep)) return false

	const { feed } = parser
	if (feed.text[feed.index + 1] !== ':' || feed.text[feed.index + 2] !== ':') return false

	const following = feed.text[feed.index + 3]
	if (following !== undefined && following !== '\n' && following !== ' ' && following !== '\t') return false

	parser.commitSpan(null, 0)
	const start = feed.index

	// Include one separating space in the hidden span when a definition follows,
	// but never consume the newline ending a bare term.
	feed.nextByLength(following === ' ' || following === '\t' ? 3 : 2)
	parser.commitSpan({
		dl_sep: {
			instance: parser.getInstanceId(start, feed.index + feed.currentStepLength)
		},
		hiddenGroup: true
	})

	return true
}
