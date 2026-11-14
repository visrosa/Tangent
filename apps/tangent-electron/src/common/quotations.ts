/**
 * Quotation series: a primary and secondary opening/closing pair.
 *
 * Preset values were checked against Unicode CLDR `delimiters.json`
 * (cldr-json, `main`) for the locales listed on each preset.
 */
export interface QuotationSeries {
	primaryOpen: string
	primaryClose: string
	secondaryOpen: string
	secondaryClose: string
}

export interface QuotationPreset {
	id: string
	name: string
	/** BCP 47 language tags (or bare languages) this preset is the CLDR value for */
	locales: string[]
	series: QuotationSeries
}

export const quotationPresets: QuotationPreset[] = [
	{
		id: 'english',
		name: '“Primary” ‘Secondary’',
		locales: ['en', 'es', 'pt', 'da', 'zh', 'ko'],
		series: { primaryOpen: '“', primaryClose: '”', secondaryOpen: '‘', secondaryClose: '’' }
	},
	{
		id: 'german',
		name: '„Primary“ ‚Secondary‘',
		locales: ['de'],
		series: { primaryOpen: '„', primaryClose: '“', secondaryOpen: '‚', secondaryClose: '‘' }
	},
	{
		id: 'nordic',
		name: '”Primary” ’Secondary’',
		locales: ['sv', 'fi'],
		series: { primaryOpen: '”', primaryClose: '”', secondaryOpen: '’', secondaryClose: '’' }
	},
	{
		id: 'french',
		name: '«Primary» «Secondary»',
		locales: ['fr'],
		series: { primaryOpen: '«', primaryClose: '»', secondaryOpen: '«', secondaryClose: '»' }
	},
	{
		id: 'italian',
		name: '«Primary» “Secondary”',
		locales: ['it'],
		series: { primaryOpen: '«', primaryClose: '»', secondaryOpen: '“', secondaryClose: '”' }
	},
	{
		id: 'russian',
		name: '«Primary» „Secondary“',
		locales: ['ru'],
		series: { primaryOpen: '«', primaryClose: '»', secondaryOpen: '„', secondaryClose: '“' }
	},
	{
		id: 'polish',
		name: '„Primary” «Secondary»',
		locales: ['pl'],
		series: { primaryOpen: '„', primaryClose: '”', secondaryOpen: '«', secondaryClose: '»' }
	},
	{
		id: 'corner',
		name: '「Primary」『Secondary』',
		locales: ['ja', 'zh-Hant', 'zh-TW', 'zh-HK'],
		series: { primaryOpen: '「', primaryClose: '」', secondaryOpen: '『', secondaryClose: '』' }
	}
]

export const defaultQuotationPresetId = 'english'
export const customQuotationPresetId = 'custom'

/**
 * Picks the preset for the first language tag with a mapping.
 * A full tag (`zh-Hant`) wins over its bare language (`zh`).
 * Returns null when no tag maps, so the caller can fall back visibly.
 */
export function presetForLocales(tags: readonly string[]): { preset: QuotationPreset, tag: string } | null {
	for (const tag of tags) {
		const normalized = tag.replace('_', '-')
		const exact = quotationPresets.find(p => p.locales.some(l => l.toLowerCase() === normalized.toLowerCase()))
		if (exact) return { preset: exact, tag }
		const language = normalized.split('-')[0].toLowerCase()
		const bare = quotationPresets.find(p => p.locales.includes(language))
		if (bare) return { preset: bare, tag }
	}
	return null
}

/** Characters that carry Markdown or HTML meaning, or are straight-quote triggers. */
const forbidden = new Set(['"', "'", '*', '_', '`', '[', ']', '~', '\\', '<', '>', '&'])

/** Returns a message for the first problem with a custom series, or null when it is valid. */
export function validateSeries(series: QuotationSeries): string | null {
	const roles = Object.entries(series) as [keyof QuotationSeries, string][]
	for (const [role, glyph] of roles) {
		if (!glyph || [...glyph].length !== 1) return 'Each quotation mark must be exactly one character.'
		if (forbidden.has(glyph) || /[\s\p{C}]/u.test(glyph)) {
			return `“${glyph}” cannot be used as a quotation mark.`
		}
	}
	return null
}

export function seriesFromSettings(
	presetId: string,
	custom: QuotationSeries,
	fallbackLocales: readonly string[] = []
): QuotationSeries {
	if (presetId === customQuotationPresetId) {
		return validateSeries(custom) ? quotationPresets[0].series : custom
	}
	const preset = quotationPresets.find(p => p.id === presetId)
		?? presetForLocales(fallbackLocales)?.preset
		?? quotationPresets[0]
	return preset.series
}

/**
 * Chooses opening or closing from the character before the typed mark.
 * Start of text, whitespace and opening punctuation open; anything else closes.
 */
export function opensQuotation(before: string | undefined): boolean {
	if (!before) return true
	return /[\s(\[{–—―]/u.test(before)
}

const apostrophe = '\u2019'

/**
 * Finds the opening mark that the mark at the end of `text` closes.
 * `text` is the line up to and including the mark just typed.
 * Returns the opener's index, or -1 when the mark closes nothing.
 *
 * `"` pairs by parity. `'` pairs with a stack that skips apostrophes
 * (a `'` between two letters or digits) so `don't` does not open a quotation.
 */
export function findQuotationOpener(text: string, mark: string): number {
	const last = text.length - 1
	if (text[last] !== mark) return -1
	const chars = [...text]
	const positions: number[] = []
	let index = 0
	for (const char of chars) {
		if (char === mark) positions.push(index)
		index += char.length
	}
	const typed = positions.pop()
	if (typed === undefined) return -1

	let opener = -1
	if (mark === '"') {
		opener = positions.length % 2 === 1 ? positions[positions.length - 1] : -1
	}
	else {
		const stack: number[] = []
		const wordChar = /[\p{L}\p{N}]/u
		for (const position of positions) {
			const before = text[position - 1]
			const after = text[position + 1]
			if (before && after && wordChar.test(before) && wordChar.test(after)) continue
			if (opensQuotation(before)) stack.push(position)
			else stack.pop()
		}
		opener = stack.length ? stack[stack.length - 1] : -1
	}
	if (opener < 0) return -1

	const inner = text.slice(opener + 1, typed)
	if (!inner || /^\s|\s$/.test(inner)) return -1
	return opener
}

/**
 * The replacement(s) to offer when `mark` was typed at the end of `text`:
 * the whole quotation re-marked in the series, or a lone apostrophe.
 * Returns the range start within `text` and the options, or null for no offer.
 */
export function quotationSuggestion(
	text: string,
	mark: string,
	series: QuotationSeries
): { start: number, options: string[] } | null {
	const opener = findQuotationOpener(text, mark)
	if (opener >= 0) {
		const inner = text.slice(opener + 1, -1)
		const [open, close] = mark === '"'
			? [series.primaryOpen, series.primaryClose]
			: [series.secondaryOpen, series.secondaryClose]
		return { start: opener, options: [open + inner + close] }
	}
	if (mark === "'" && /[\p{L}\p{N}]$/u.test(text.slice(0, -1))) {
		return { start: text.length - 1, options: [apostrophe] }
	}
	return null
}

/** Re-marks a source of the form `"inner"` or `'inner'`, or null if it no longer has that form. */
export function remarkQuotation(source: string, series: QuotationSeries): string | null {
	const mark = source[0]
	if ((mark !== '"' && mark !== "'") || source.length < 3 || source[source.length - 1] !== mark) return null
	const inner = source.slice(1, -1)
	if (inner.includes(mark) && mark === '"') return null
	const [open, close] = mark === '"'
		? [series.primaryOpen, series.primaryClose]
		: [series.secondaryOpen, series.secondaryClose]
	return open + inner + close
}
