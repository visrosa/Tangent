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
 * Nested spans are intentionally inactive in V1: the first unescaped `{`
 * after the opener invalidates the span rather than being balanced against it.
 */
export function parseFuriganaSpan(text: string, start = 0): FuriganaSpan | null {
	if (text[start] !== '{' || isEscaped(text, start)) return null

	let separatorIndex = -1
	let escaped = false

	for (let index = start + 1; index < text.length; index++) {
		const char = text[index]

		if (char === '\n' || char === '\r') return null

		if (escaped) {
			escaped = false
			continue
		}
		if (char === '\\') {
			escaped = true
			continue
		}

		if (char === '{') return null // nesting not supported

		if (char === '}') {
			if (separatorIndex < 0) return null

			const base = unescapeFuriganaText(text.slice(start + 1, separatorIndex).trim())
			const reading = unescapeFuriganaText(text.slice(separatorIndex + 1, index).trim())
			if (!base || !reading) return null

			return { end: index, furigana: { base, reading } }
		}

		if (separatorIndex < 0 && char === '|') {
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

const escapedFuriganaCharPattern = /\\([{}|])/g

function unescapeFuriganaText(text: string): string {
	return text.replace(escapedFuriganaCharPattern, '$1')
}
