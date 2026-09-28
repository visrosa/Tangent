import NoteParser from './NoteParser'

export type GlossData = {
	base: string
	description: string
	/** Distinguishes adjacent glosses that share a base and description. */
	instance?: string
}

export type GlossScanResult =
	| { type: 'valid', end: number, gloss: GlossData }
	| { type: 'literal', end: number } // has an unescaped `::` but an empty field
	| { type: 'invalid' }

/**
 * Scans a `{base::description}` span. Only the first unescaped `::` separates;
 * `|` has no meaning here, which is what gives gloss precedence over furigana
 * (parseInlineGloss runs first). Nested spans are left for the furigana
 * scanner to reject.
 */
export function scanGlossSpan(text: string, start = 0): GlossScanResult {
	if (text[start] !== '{' || isEscaped(text, start)) return { type: 'invalid' }

	let separatorIndex = -1

	for (let index = start + 1; index < text.length; index++) {
		const char = text[index]

		if (char === '\n' || char === '\r') return { type: 'invalid' }

		const next = text[index + 1]
		if (char === '\\' && next !== '\\' && next !== '\n' && next !== '\r') {
			index++ // skip the escaped character
			continue
		}

		if (char === '{') return { type: 'invalid' }

		if (char === '}') {
			if (separatorIndex < 0) return { type: 'invalid' }

			const base = unescapeGlossText(trimUnescapedWhitespace(text.slice(start + 1, separatorIndex)))
			const description = unescapeGlossText(trimUnescapedWhitespace(text.slice(separatorIndex + 2, index)))
			if (!base || !description) return { type: 'literal', end: index }

			return { type: 'valid', end: index, gloss: { base, description } }
		}

		if (separatorIndex < 0 && char === ':' && next === ':') {
			separatorIndex = index
			index++ // the separator is two characters wide
		}
	}

	return { type: 'invalid' }
}

export function parseInlineGloss(char: string, parser: NoteParser): boolean {
	if (char !== '{') return false

	const { feed } = parser
	const result = scanGlossSpan(feed.text, feed.index)

	if (result.type === 'invalid') return false

	if (result.type === 'literal') {
		// An unescaped `::` means this was meant as a gloss; consume it as
		// plain text so the furigana scanner can't claim it instead.
		feed.nextByLength(result.end - feed.index)
		parser.commitSpan(null)
		return true
	}

	parser.commitSpan(null, 0)
	const start = feed.index
	feed.nextByLength(result.end - feed.index)
	parser.commitSpan({
		gloss: { ...result.gloss, instance: parser.getInstanceId(start, result.end + 1) },
		hiddenGroup: true
	})
	return true
}

// The helpers below duplicate furigana.ts's rather than importing them, so
// this fork-only module never forces a change to the upstream-bound one.

// A backslash can escape any character except another backslash, so escaping
// only ever depends on the single character immediately before `index`.
function isEscaped(text: string, index: number): boolean {
	return text[index - 1] === '\\' && text[index] !== '\\'
}

// Stops at an escaped whitespace character so an escape pair is never split.
function trimUnescapedWhitespace(text: string): string {
	let start = 0
	while (start < text.length && isUnescapedWhitespace(text, start)) start++

	let end = text.length
	while (end > start && isUnescapedWhitespace(text, end - 1)) end--

	return text.slice(start, end)
}

const whitespaceRegex = /\s/

function isUnescapedWhitespace(text: string, index: number): boolean {
	return whitespaceRegex.test(text[index]) && !isEscaped(text, index)
}

const unescapeRegex = /\\([^\\])/g

function unescapeGlossText(text: string): string {
	return text.replace(unescapeRegex, '$1')
}
