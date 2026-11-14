import { describe, expect, it } from 'vitest'
import { opensQuotation, quotationSuggestion, remarkQuotation, findQuotationOpener, presetForLocales, seriesFromSettings, validateSeries, quotationPresets } from './quotations'

describe('quotations', () => {
	it('maps locales, preferring a full tag over its language', () => {
		expect(presetForLocales(['pt-BR'])?.preset.id).toBe('english')
		expect(presetForLocales(['zh-Hant'])?.preset.id).toBe('corner')
		expect(presetForLocales(['zh-CN'])?.preset.id).toBe('english')
		expect(presetForLocales(['de-CH', 'en'])?.preset.id).toBe('german')
		expect(presetForLocales(['xx'])).toBeNull()
	})

	it('moves to the next language when one has no mapping', () => {
		expect(presetForLocales(['xx', 'fr-CA'])?.tag).toBe('fr-CA')
	})

	it('rejects invalid custom marks', () => {
		const ok = quotationPresets[0].series
		expect(validateSeries(ok)).toBeNull()
		expect(validateSeries({ ...ok, primaryOpen: '"' })).not.toBeNull()
		expect(validateSeries({ ...ok, primaryClose: '*' })).not.toBeNull()
		expect(validateSeries({ ...ok, secondaryOpen: '' })).not.toBeNull()
		expect(validateSeries({ ...ok, secondaryClose: '““' })).not.toBeNull()
	})

	it('falls back to English for an invalid custom series', () => {
		const bad = { ...quotationPresets[0].series, primaryOpen: '"' }
		expect(seriesFromSettings('custom', bad)).toEqual(quotationPresets[0].series)
	})

	it('opens after whitespace, openers and at the start', () => {
		expect(opensQuotation(undefined)).toBe(true)
		expect(opensQuotation(' ')).toBe(true)
		expect(opensQuotation('(')).toBe(true)
		expect(opensQuotation('a')).toBe(false)
		expect(opensQuotation('.')).toBe(false)
	})

	it('offers the whole completed quotation', () => {
		const en = quotationPresets[0].series
		const german = quotationPresets.find(p => p.id === 'german').series
		expect(quotationSuggestion('"teste"', '"', en)).toEqual({ start: 0, options: ['“teste”'] })
		expect(quotationSuggestion('say "a b"', '"', german)).toEqual({ start: 4, options: ['„a b“'] })
		expect(quotationSuggestion("he said 'hi'", "'", en)).toEqual({ start: 8, options: ['‘hi’'] })
	})

	it('offers nothing for an opening mark or an empty or padded pair', () => {
		const en = quotationPresets[0].series
		expect(quotationSuggestion('say "', '"', en)).toBeNull()
		expect(quotationSuggestion('""', '"', en)).toBeNull()
		expect(quotationSuggestion('" a"', '"', en)).toBeNull()
		expect(quotationSuggestion('"a "', '"', en)).toBeNull()
	})

	it('pairs double marks by parity, so finished pairs do not interfere', () => {
		expect(findQuotationOpener('"a" and "b"', '"')).toBe(8)
		expect(findQuotationOpener('"a" and "b', '"')).toBe(-1)
	})

	it('does not treat apostrophes as quotation marks', () => {
		const en = quotationPresets[0].series
		expect(quotationSuggestion("don'", "'", en)).toEqual({ start: 3, options: ['’'] })
		expect(quotationSuggestion("'don't win'", "'", en)).toEqual({ start: 0, options: ["‘don't win’"] })
		expect(findQuotationOpener("it's 'fine'", "'")).toBe(5)
	})

	it('re-marks only an intact quotation source', () => {
		const en = quotationPresets[0].series
		expect(remarkQuotation('"teste"', en)).toBe('“teste”')
		expect(remarkQuotation('"teste"x', en)).toBeNull()
		expect(remarkQuotation('"', en)).toBeNull()
		expect(remarkQuotation('"a"b"', en)).toBeNull()
	})
})
