import { describe, expect, it } from 'vitest'
import {
	parseOverrides, resolveSubstitutions, serializeOverrides, substitutionDefinitions,
	validateSubstitution, withOverride, type GroupModes
} from './substitutions'

const groups: GroupModes = { arrows: 'suggest', dashes: 'suggest', ellipsis: 'suggest' }

describe('parseOverrides', () => {
	it('reads what serializeOverrides wrote', () => {
		const overrides = { 'arrow-right': { mode: 'auto' as const, target: '⟶' } }
		expect(parseOverrides(serializeOverrides(overrides))).toEqual(overrides)
	})
	it('treats empty, malformed and non-object input as no overrides', () => {
		for (const bad of ['', '{', 'null', '[]', '3', '"x"']) expect(parseOverrides(bad)).toEqual({})
		expect(parseOverrides(undefined)).toEqual({})
	})
	it('drops unknown ids and invalid fields', () => {
		const json = JSON.stringify({
			nonsense: { mode: 'auto' },
			'arrow-left': { mode: 'sometimes', source: '', target: 4 },
			'dash-en': { mode: 'off', extra: 1 }
		})
		expect(parseOverrides(json)).toEqual({ 'dash-en': { mode: 'off' } })
	})
})

describe('resolveSubstitutions', () => {
	it('reproduces the built-in order: a longer source before its prefix', () => {
		const sources = resolveSubstitutions(groups, {}).map(r => r.source)
		expect(sources.indexOf('---')).toBeLessThan(sources.indexOf('--'))
		expect(sources.indexOf('-->')).toBeLessThan(sources.indexOf('->'))
		expect(sources.indexOf('<--')).toBeLessThan(sources.indexOf('<-'))
		expect(sources.indexOf('==>')).toBeLessThan(sources.indexOf('=>'))
	})
	it('uses the group mode unless the pair overrides it', () => {
		const rules = resolveSubstitutions(groups, { 'dash-en': { mode: 'auto' } })
		expect(rules.find(r => r.id === 'dash-en').mode).toBe('auto')
		expect(rules.find(r => r.id === 'dash-em').mode).toBe('suggest')
	})
	it('puts an edited target first and keeps the rest as further suggestions', () => {
		const rule = resolveSubstitutions(groups, { 'arrow-right': { target: '⟶' } }).find(r => r.id === 'arrow-right')
		expect(rule.replace).toEqual(['⟶', '→', '➝', '➞'])
		expect(rule.target).toBe('⟶')
	})
	it('escapes an edited source', () => {
		const rule = resolveSubstitutions(groups, { ellipsis: { source: '(c)' } }).find(r => r.id === 'ellipsis')
		expect(rule.match.test('(c)')).toBe(true)
		expect(rule.match.test('c')).toBe(false)
		expect(rule.customSource).toBe(true)
	})
	it('matches the built-in families when the source is unchanged', () => {
		const rule = resolveSubstitutions(groups, {}).find(r => r.id === 'arrow-right-long')
		expect(rule.match.test('--->')).toBe(true)
	})
	it('has a unique id and source for every definition', () => {
		expect(new Set(substitutionDefinitions.map(d => d.id)).size).toBe(substitutionDefinitions.length)
		expect(new Set(substitutionDefinitions.map(d => d.source)).size).toBe(substitutionDefinitions.length)
	})
})

describe('validateSubstitution', () => {
	const rules = resolveSubstitutions(groups, {})
	it('accepts an unchanged pair', () => {
		expect(validateSubstitution('arrow-right', '->', '→', rules)).toBeNull()
	})
	it('rejects empty, spaced and looping values', () => {
		expect(validateSubstitution('arrow-right', '', '→', rules)).toMatch(/empty/)
		expect(validateSubstitution('arrow-right', '- >', '→', rules)).toMatch(/whitespace/)
		expect(validateSubstitution('arrow-right', '->', '', rules)).toMatch(/empty/)
		expect(validateSubstitution('dash-en', '-', '--', rules)).toMatch(/own source/)
	})
	it('rejects a source another pair already uses', () => {
		expect(validateSubstitution('arrow-right', '=>', '→', rules)).toMatch(/already/)
	})
})

describe('withOverride', () => {
	it('stores a change and drops a field that restates the built-in value', () => {
		let o = withOverride({}, 'arrow-right', { target: '⟶' })
		expect(o).toEqual({ 'arrow-right': { target: '⟶' } })
		o = withOverride(o, 'arrow-right', { target: '→' })
		expect(o).toEqual({})
	})
	it('clears a field when it is set to undefined', () => {
		const o = withOverride({ 'dash-en': { mode: 'auto', source: '~~' } }, 'dash-en', { mode: undefined })
		expect(o).toEqual({ 'dash-en': { source: '~~' } })
	})
	it('ignores an unknown id', () => {
		expect(withOverride({}, 'nope', { mode: 'auto' })).toEqual({})
	})
})
