import type { ResolvedSubstitution, SubstitutionMode } from './substitutions'
import { findQuotationOpener, remarkQuotation, type QuotationSeries } from './quotations'

/**
 * Auto-Replace: a substitution applies when a boundary character follows the
 * source, never on the source's last keystroke. Waiting for the boundary is what
 * settles the prefix problem (`--` before `---`, `->` before `-->`): the whole
 * source is typed by then, so only an exact match can fire.
 */

/**
 * Characters that may follow a source. None may occur inside any source
 * (`-<>=.` and the quote marks), or typing the source would trigger itself.
 * Enter counts, handled by the caller as a line break.
 */
const boundaryPunctuation = ',;:!?)]}'

export function isBoundary(char: string): boolean {
	return char === '\n' || /^\s$/u.test(char) || (char.length === 1 && boundaryPunctuation.includes(char))
}

/** Characters from which sources are built; a match may not start right after one. */
const sourceAlphabet = '-<>=.'

export interface AutoReplacement {
	/** Offsets into the text that was searched */
	start: number
	end: number
	replacement: string
}

/**
 * Finds the substitution that a boundary typed after `before` completes. `before`
 * is the text of the line up to the boundary. The source must end the
 * whitespace-delimited word and not continue a longer run of source characters, so
 * `----` is left alone and `a->b` is not replaced (only a trailing `a->` is).
 */
export function findAutoReplacement(
	before: string,
	rules: ResolvedSubstitution[]
): AutoReplacement | null {
	const wordStart = before.search(/\S*$/u)
	const word = before.slice(wordStart)
	for (const rule of rules) {
		if (rule.mode !== 'auto') continue
		const match = rule.anchored.exec(word)
		if (!match) continue
		// The character before the match belongs to the same run when it is a
		// built-in source character or one of this source's own
		if (match.index > 0) {
			const previous = word[match.index - 1]
			if (sourceAlphabet.includes(previous) || match[0].includes(previous)) continue
		}
		// A leading `---` is Markdown, not a dash
		if (rule.mustBeMidLine && wordStart + match.index === 0) continue
		return {
			start: wordStart + match.index,
			end: before.length,
			replacement: rule.replace[0]
		}
	}
	return null
}

/**
 * Finds a completed `"…"` or `'…'` that ends `before`, with the span re-marked in
 * `series`. A lone apostrophe is not replaced automatically: only a whole pair is
 * a settled source.
 */
export function findAutoQuotation(before: string, series: QuotationSeries): AutoReplacement | null {
	const mark = before[before.length - 1]
	if (mark !== '"' && mark !== "'") return null
	const opener = findQuotationOpener(before, mark)
	if (opener < 0) return null
	const replacement = remarkQuotation(before.slice(opener), series)
	if (!replacement) return null
	return { start: opener, end: before.length, replacement }
}

export interface AutoReplaceModes {
	rules: ResolvedSubstitution[]
	quotes: SubstitutionMode
}

/**
 * Decides what typing `boundary` completes, given the line's text before it.
 * `isProtected` reports whether a line offset lies in a span that must not be
 * rewritten (code, math, link syntax). Returns null when nothing applies.
 */
export function planAutoReplace(
	before: string,
	boundary: string,
	modes: AutoReplaceModes,
	series: QuotationSeries,
	isProtected: (offset: number) => boolean
): AutoReplacement | null {
	if (!isBoundary(boundary) || !before) return null
	const found = findAutoReplacement(before, modes.rules)
		?? (modes.quotes === 'auto' ? findAutoQuotation(before, series) : null)
	if (!found) return null
	for (let i = found.start; i < found.end; i++) {
		if (isProtected(i)) return null
	}
	return found
}
