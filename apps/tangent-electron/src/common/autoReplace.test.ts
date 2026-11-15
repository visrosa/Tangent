import { describe, expect, it } from 'vitest'
import { findAutoQuotation, findAutoReplacement, isBoundary, planAutoReplace } from './autoReplace'
import { seriesFromSettings } from './quotations'
import { resolveSubstitutions, type SubstitutionGroupId, type SubstitutionMode, type SubstitutionOverrides } from './substitutions'

const allAuto = (_group?: SubstitutionGroupId): SubstitutionMode => 'auto'
const resolveWith = (
	mode: (g: SubstitutionGroupId) => SubstitutionMode,
	overrides: SubstitutionOverrides = {}
) => resolveSubstitutions({ arrows: mode('arrows'), dashes: mode('dashes'), ellipsis: mode('ellipsis') }, overrides)
const only = (group: string) => (g: SubstitutionGroupId): SubstitutionMode => (g === group ? 'auto' : 'suggest')

describe('isBoundary', () => {
	it('accepts whitespace, line breaks and closing punctuation', () => {
		for (const c of [' ', '\t', '\n', ',', ';', ':', '!', '?', ')', ']', '}']) expect(isBoundary(c)).toBe(true)
	})
	it('rejects every character that occurs inside a source', () => {
		for (const c of ['-', '<', '>', '=', '.', '"', "'", 'a']) expect(isBoundary(c)).toBe(false)
	})
})

describe('findAutoReplacement', () => {
	const run = (
		before: string,
		mode: (g: SubstitutionGroupId) => SubstitutionMode = allAuto,
		overrides: SubstitutionOverrides = {}
	) => {
		const found = findAutoReplacement(before, resolveWith(mode, overrides))
		return found && { ...found, text: before.slice(found.start, found.end) }
	}

	it('replaces an exact source with its preferred target', () => {
		expect(run('a ->')).toMatchObject({ start: 2, end: 4, replacement: '→', text: '->' })
		expect(run('a -->')).toMatchObject({ replacement: '➞' })
		expect(run('a <--')).toMatchObject({ replacement: '⟵' })
		expect(run('a ==>')).toMatchObject({ replacement: '⟹' })
		expect(run('a <=')).toMatchObject({ replacement: '⇐' })
	})

	it('prefers the longer source, so a prefix never fires early', () => {
		expect(run('a --')).toMatchObject({ replacement: '–' })
		expect(run('a ---')).toMatchObject({ replacement: '—' })
		expect(run('a ..')).toMatchObject({ replacement: '…' })
		expect(run('a ....')).toMatchObject({ replacement: '…', start: 2 })
	})

	it('does not take the tail of a longer run of source characters', () => {
		expect(run('a ----')).toBeNull()
		expect(run('a <-->')).toBeNull()
	})

	it('leaves a source inside a word alone, but replaces a trailing one', () => {
		expect(run('a->b')).toBeNull()
		expect(run('x->')).toMatchObject({ start: 1, replacement: '→' })
	})

	it('treats a leading dash run as Markdown, not as a dash', () => {
		expect(run('---')).toBeNull()
		expect(run('--')).toBeNull()
		expect(run('a ---')).not.toBeNull()
		expect(run('->')).toMatchObject({ replacement: '→' })
	})

	it('only applies groups set to Auto-Replace', () => {
		expect(run('a ->', only('dashes'))).toBeNull()
		expect(run('a --', only('dashes'))).toMatchObject({ replacement: '–' })
		expect(run('a --', () => 'off')).toBeNull()
	})

	it('finds nothing in plain text', () => {
		expect(run('')).toBeNull()
		expect(run('hello world')).toBeNull()
		expect(run('end.')).toBeNull()
	})
})

describe('findAutoQuotation', () => {
	const series = seriesFromSettings('english', {} as any, [])

	it('re-marks a completed pair', () => {
		expect(findAutoQuotation('say "hi"', series)).toEqual({ start: 4, end: 8, replacement: '“hi”' })
		expect(findAutoQuotation("say 'hi'", series)).toEqual({ start: 4, end: 8, replacement: '‘hi’' })
	})

	it('leaves an opening mark, an apostrophe and a non-quote ending alone', () => {
		expect(findAutoQuotation('say "hi', series)).toBeNull()
		expect(findAutoQuotation("don't", series)).toBeNull()
		expect(findAutoQuotation("don'", series)).toBeNull()
		expect(findAutoQuotation('plain', series)).toBeNull()
	})
})

describe('findAutoReplacement with overrides', () => {
	const run = (before: string, overrides: SubstitutionOverrides, mode = allAuto) => {
		const found = findAutoReplacement(before, resolveWith(mode, overrides))
		return found && { ...found, text: before.slice(found.start, found.end) }
	}

	it('lets one pair differ from its group', () => {
		const overrides = { 'arrow-right': { mode: 'suggest' as const } }
		expect(run('a ->', overrides)).toBeNull()
		expect(run('a <-', overrides)).toMatchObject({ replacement: '←' })
		expect(run('a ->', { 'arrow-right': { mode: 'auto' } }, () => 'off')).toMatchObject({ replacement: '→' })
	})

	it('applies an edited target', () => {
		expect(run('a ->', { 'arrow-right': { target: '⟶' } })).toMatchObject({ replacement: '⟶' })
	})

	it('matches an edited source literally, not as the family it replaced', () => {
		const overrides = { 'arrow-right-long': { source: '~>' } }
		expect(run('a ~>', overrides)).toMatchObject({ replacement: '➞', text: '~>' })
		expect(run('a -->', overrides)).toBeNull()
		expect(run('a --->', overrides)).toBeNull()
	})

	it('tries a longer edited source before a shorter one', () => {
		expect(run('a <->', { 'dash-em': { source: '<->', target: '↔' } })).toMatchObject({ replacement: '↔', text: '<->' })
	})

	it('does not take the tail of a longer run of an edited source\'s own characters', () => {
		const overrides = { 'ellipsis': { source: 'xx' } }
		expect(run('a xx', overrides)).toMatchObject({ replacement: '…' })
		expect(run('a xxx', overrides)).toBeNull()
	})
})

describe('planAutoReplace', () => {
	const series = seriesFromSettings('english', {} as any, [])
	const modes = (quotes: SubstitutionMode, group: SubstitutionMode = 'auto') => ({ rules: resolveWith(() => group), quotes })
	const free = () => false

	it('needs a boundary character after the source', () => {
		expect(planAutoReplace('a ->', ' ', modes('off'), series, free)).toMatchObject({ replacement: '→' })
		expect(planAutoReplace('a ->', '>', modes('off'), series, free)).toBeNull()
		expect(planAutoReplace('a ->', 'x', modes('off'), series, free)).toBeNull()
	})

	it('replaces quotations only when their mode is Auto-Replace', () => {
		expect(planAutoReplace('say "hi"', ' ', modes('auto'), series, free)).toMatchObject({ replacement: '“hi”' })
		expect(planAutoReplace('say "hi"', ' ', modes('suggest'), series, free)).toBeNull()
		expect(planAutoReplace('say "hi"', ' ', modes('off'), series, free)).toBeNull()
	})

	it('takes a quotation after punctuation and at the end of a line', () => {
		expect(planAutoReplace('say "hi"', ',', modes('auto'), series, free)).not.toBeNull()
		expect(planAutoReplace('say "hi"', '\n', modes('auto'), series, free)).not.toBeNull()
	})

	it('leaves protected spans alone', () => {
		expect(planAutoReplace('a ->', ' ', modes('off'), series, i => i === 3)).toBeNull()
		expect(planAutoReplace('say "hi"', ' ', modes('auto'), series, i => i === 5)).toBeNull()
	})
})
