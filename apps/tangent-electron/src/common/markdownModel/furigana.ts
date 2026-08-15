import NoteParser from './NoteParser'

export type FuriganaData = {
	base: string
	reading: string
}

export type FuriganaSpan = {
	end: number
	furigana: FuriganaData
}

/**
 * Scans a complete `{base|reading}` furigana span starting at `start`.
 *
 * Nested braces are balanced so their boundaries cannot be mistaken for the
 * outer boundary, but nested spans remain intentionally inactive in V1.
 */
export function parseFuriganaSpan(text: string, start = 0): FuriganaSpan | null {
	if (text[start] !== '{' || isEscaped(text, start)) return null

	let depth = 1
	let hasNestedBraces = false
	let separatorIndex = -1

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
			if (separatorIndex < 0) return null

			const base = unescapeFuriganaText(text.slice(start + 1, separatorIndex).trim())
			const reading = unescapeFuriganaText(text.slice(separatorIndex + 1, index).trim())
			if (!base || !reading) return null

			return { end: index, furigana: { base, reading } }
		}

		if (depth === 1 && separatorIndex < 0 && char === '|') {
			separatorIndex = index
		}
	}

	return null
}

export function parseInlineFurigana(char: string, parser: NoteParser): boolean {
	if (char !== '{') return false

	const { feed } = parser
	const match = parseFuriganaSpan(feed.text, feed.index)
	if (!match) return false

	parser.commitSpan(null, 0)
	feed.nextByLength(match.end - feed.index)
	parser.commitSpan({
		furigana: match.furigana,
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

function unescapeFuriganaText(text: string): string {
	return text.replace(/\\(\{|\}|\|)/g, '$1')
}
