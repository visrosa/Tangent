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

/**
 * The marks to offer, best first, when a straight `"` or `'` is typed after `before`.
 * A straight `'` after a letter or digit is most often an apostrophe, which is U+2019.
 */
export function quotationOptions(mark: string, before: string | undefined, series: QuotationSeries): string[] {
	const apostrophe = '\u2019'
	const opens = opensQuotation(before)
	let options: string[]
	if (mark === '"') {
		options = opens ? [series.primaryOpen, series.primaryClose] : [series.primaryClose, series.primaryOpen]
	}
	else if (opens) {
		options = [series.secondaryOpen, series.secondaryClose, apostrophe]
	}
	else if (before && /[\p{L}\p{N}]/u.test(before)) {
		options = [apostrophe, series.secondaryClose, series.secondaryOpen]
	}
	else {
		options = [series.secondaryClose, apostrophe, series.secondaryOpen]
	}
	return [...new Set(options)]
}
