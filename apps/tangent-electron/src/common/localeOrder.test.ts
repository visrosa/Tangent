import { describe, expect, it } from 'vitest'
import { systemRank, systemFirst } from './localeOrder'

describe('localeOrder', () => {
	it('ranks exact, then more specific, then same language, then none', () => {
		const sys = ['en-GB']
		expect(systemRank('en-GB', sys)).toBe(0)
		expect(systemRank('en-GB-oxendict', sys)).toBe(1)
		expect(systemRank('en-US', sys)).toBe(2)
		expect(systemRank('de', sys)).toBe(Infinity)
	})

	it('treats underscores and case alike', () => {
		expect(systemRank('pt_br', ['pt-BR'])).toBe(0)
	})

	it('puts earlier system languages first and keeps the rest in order', () => {
		const list = ['de', 'en-US', 'fr', 'pt-BR', 'en-GB', 'pt-PT']
		expect(systemFirst(list, t => t, ['en-GB', 'pt-BR'])).toEqual(
			['en-GB', 'en-US', 'pt-BR', 'pt-PT', 'de', 'fr'])
	})

	it('leaves the list alone when the system reports nothing', () => {
		expect(systemFirst(['b', 'a'], t => t, [])).toEqual(['b', 'a'])
	})
})
