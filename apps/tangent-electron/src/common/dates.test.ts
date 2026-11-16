import { describe, test, expect, it } from 'vitest'

import * as dates from './dates'
import { templateLookup } from './markdownModel/templates'
import CreationRule, { nameFromRule } from './settings/CreationRule'
import { vi } from 'vitest'

test('Shortest Day Date', () => {
	const now = new Date(2000, 8, 1)

	expect(dates.shortestDayDate(now, now)).toEqual('Today')
	expect(dates.shortestDayDate(new Date(2000, 7, 31), now)).toEqual('Yesterday')
	expect(dates.shortestDayDate(new Date(2000, 8, 2), now)).toEqual('Tomorrow')

	expect(dates.shortestDayDate(new Date(2000, 9, 15), now)).toEqual('Oct 15')
	expect(dates.shortestDayDate(new Date(2001, 0, 7), now)).toEqual('Jan 7 2001')
})

test('Clock Time', () => {
	expect(dates.clockTime(new Date(2000, 1, 1, 5, 30))).toEqual('5:30am')
	expect(dates.clockTime(new Date(2000, 1, 1, 13, 45))).toEqual('1:45pm')
	expect(dates.clockTime(new Date(2000, 1, 1, 0, 0))).toEqual('12:00am')
})

describe('Date Format', () => {
	it('Should replace years', () => {
		expect(dates.fillDateFormat('%YYYY%-%YYYY%', new Date(2000, 1, 1, 5, 30))).toEqual('2000-2000')
	})

	it('Should replace months and days', () => {
		expect(dates.fillDateFormat('%MM%-%DD%', new Date(2000, 1, 1, 5, 30))).toEqual('02-01')
	})

	it('Should allow for short "th"ed dates', () => {
		expect(dates.fillDateFormat('%MM%-%Do%', new Date(2000, 1, 1, 5, 30))).toEqual('02-1st')
		expect(dates.fillDateFormat('%MM%-%Do%', new Date(2000, 1, 2, 5, 30))).toEqual('02-2nd')
		expect(dates.fillDateFormat('%MM%-%Do%', new Date(2000, 1, 3, 5, 30))).toEqual('02-3rd')
		expect(dates.fillDateFormat('%MM%-%Do%', new Date(2000, 1, 4, 5, 30))).toEqual('02-4th')
	})

	it('Should allow for long "th"ed dates', () => {
		expect(dates.fillDateFormat('%MM%-%DDo%', new Date(2000, 1, 5, 5, 30))).toEqual('02-05th')
		expect(dates.fillDateFormat('%MM%-%DDo%', new Date(2000, 1, 23, 5, 30))).toEqual('02-23rd')
	})

	it('Should handle "th"ing the silly teens', () => {
		expect(dates.fillDateFormat('%DDo%', new Date(2000, 1, 11, 1, 1))).toEqual('11th')
		expect(dates.fillDateFormat('%DDo%', new Date(2000, 1, 12, 1, 1))).toEqual('12th')
		expect(dates.fillDateFormat('%DDo%', new Date(2000, 1, 13, 1, 1))).toEqual('13th')
	})

	it('Should handle weeks', () => {
		expect(dates.fillDateFormat('%W%', new Date(2000, 0, 14, 1, 1))).toEqual('2')
		expect(dates.fillDateFormat('%WW%', new Date(2000, 0, 14, 1, 1))).toEqual('02')
	})
})

describe('Day of year templates', () => {
	it.each([
		[2023, 0, 1, '001'], [2024, 1, 29, '060'],
		[2023, 11, 31, '365'], [2024, 11, 31, '366'],
		[2024, 2, 10, '070'], [2024, 2, 11, '071'],
		[2024, 10, 3, '308'], [2024, 10, 4, '309']
	])('formats local %i-%i-%i as %s', (year, month, day, expected) => {
		for (const hour of [0, 12, 23]) {
			const date = new Date(year, month, day, hour, 59)
			expect(dates.fillDateFormat('%DDD%/%DDD%/%DD%/%D%/%unknown%', date))
				.toBe(`${expected}/${expected}/${String(day).padStart(2, '0')}/${day}/%unknown%`)
		}
	})
	it('offers the token and expands creation rule names', () => {
		expect(templateLookup['%DDD%'].text).toBe('%DDD%')
		vi.useFakeTimers()
		try {
			vi.setSystemTime(new Date(2024, 1, 29, 0, 1))
			expect(nameFromRule(new CreationRule({ nameTemplate: '%YYYY%-%DDD%-%name%' }), 'Daily')).toBe('2024-060-Daily')
		} finally { vi.useRealTimers() }
	})
})
