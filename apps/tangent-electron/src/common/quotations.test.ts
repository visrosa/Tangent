import { describe, expect, it } from 'vitest'
import { opensQuotation, quotationOptions, presetForLocales, seriesFromSettings, validateSeries, quotationPresets } from './quotations'

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

	it('offers the chosen series for typed marks', () => {
		const german = quotationPresets.find(p => p.id === 'german').series
		expect(quotationOptions('"', ' ', german)).toEqual(['„', '“'])
		expect(quotationOptions('"', 'a', german)).toEqual(['“', '„'])
		const nordic = quotationPresets.find(p => p.id === 'nordic').series
		// Closing and apostrophe coincide, so the list has no duplicate
		expect(quotationOptions("'", 'n', nordic)).toEqual(['’'])
		expect(quotationOptions("'", ' ', quotationPresets[0].series)).toEqual(['‘', '’'])
	})
})
