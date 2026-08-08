import NoteParser from './NoteParser'

export type InlineAnnotation =
	| {
		kind: 'ruby'
		base: string
		annotation: string
	}
	| {
		kind: 'description'
		base: string
		annotation: string
	}

export type AnnotationSpan = {
	end: number
	annotation: InlineAnnotation
}

type Separator = {
	index: number
	length: number
	kind: InlineAnnotation['kind']
}

/**
 * Scans a complete annotation starting at `start`.
 *
 * Nested braces are balanced so their boundaries cannot be mistaken for the
 * outer boundary, but nested annotations remain intentionally inactive in V1.
 */
export function parseAnnotationSpan(text: string, start = 0): AnnotationSpan | null {
	if (text[start] !== '{' || isEscaped(text, start)) return null

	let depth = 1
	let hasNestedBraces = false
	let descriptionSeparator: Separator = null
	let rubySeparator: Separator = null

	for (let index = start + 1; index < text.length; index++) {
		const char = text[index]

		if (char === '\n' || char === '\r') return null
		if (isEscaped(text, index)) continue

		if (char === '{') {
			depth++
			hasNestedBraces = true
			continue
		}
		if (char === '}') {
			depth--
			if (depth > 0) continue
			if (depth < 0 || hasNestedBraces) return null

			const separator = descriptionSeparator ?? rubySeparator
			if (!separator) return null

			const base = unescapeAnnotationText(text.slice(start + 1, separator.index).trim())
			const annotation = unescapeAnnotationText(
				text.slice(separator.index + separator.length, index).trim()
			)
			if (!base || !annotation) return null

			return {
				end: index,
				annotation: {
					kind: separator.kind,
					base,
					annotation
				}
			}
		}

		if (depth !== 1) continue
		if (!descriptionSeparator && char === ':' && text[index + 1] === ':') {
			descriptionSeparator = { index, length: 2, kind: 'description' }
			index++
		}
		else if (!rubySeparator && char === '|') {
			rubySeparator = { index, length: 1, kind: 'ruby' }
		}
	}

	return null
}

export function parseInlineAnnotation(char: string, parser: NoteParser): boolean {
	if (char !== '{') return false

	const { feed } = parser
	const match = parseAnnotationSpan(feed.text, feed.index)
	if (!match) return false

	parser.commitSpan(null, 0)
	feed.nextByLength(match.end - feed.index)
	parser.commitSpan({
		annotation: match.annotation,
		hiddenGroup: true
	})
	return true
}

function isEscaped(text: string, index: number): boolean {
	let backslashes = 0
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) {
		backslashes++
	}
	return backslashes % 2 === 1
}

function unescapeAnnotationText(text: string): string {
	return text.replace(/\\(\{|\}|\||::)/g, '$1')
}
