import { describe, test, expect } from 'vitest'

import { getEditInfo, getOperationRange } from '.'
import { Delta } from '@typewriter/delta'
import { Line, TextDocument } from '@typewriter/document'

describe('Edit Info', () => {
	test('Raw Delta insert', () => {
		expect(getEditInfo(new Delta([
			{ retain: 4 },
			{ insert: 'Foo' },
			{ retain: 3 }
		]))).toEqual({ offset: 4, insert: 'Foo', shift: 3 })

		expect(getEditInfo(new Delta([
			{ retain: 5 },
			{ insert: 'Food' }
		]))).toEqual({ offset: 5, insert: 'Food', shift: 4 })

		expect(getEditInfo(new Delta([
			{ insert: 'G' }
		]))).toEqual({ offset: 0, insert: 'G', shift: 1 })
	})

	test('Raw Delta delete', () => {
		expect(getEditInfo(new Delta([
			{ retain: 4 },
			{ delete: 3 },
			{ retain: 3 }
		]))).toEqual({ offset: 4, shift: -3 })

		expect(getEditInfo(new Delta([
			{ delete: 1 }
		]))).toEqual({ offset: 0, shift: -1 })
	})

	test('Compound retain insert', () => {
		expect(getEditInfo(new Delta([
			{ retain: 4 },
			{ retain: 2 },
			{ retain: 12 },
			{ insert: 'Foo' },
			{ retain: 3 }
		]))).toEqual({ offset: 18, insert: 'Foo', shift: 3 })
	})

	test('Compound retain delete', () => {
		expect(getEditInfo(new Delta([
			{ retain: 4 },
			{ retain: 2 },
			{ retain: 12 },
			{ delete: 1 },
			{ retain: 3 },
			{ retain: 16 }
		]))).toEqual({ offset: 18, shift: -1 })
	})
})

describe('getOperationRange', () => {
	const doc = new TextDocument([Line.create(new Delta([
		{ insert: 'a', attributes: { furigana: { base: 'x' } } },
		{ insert: 'b', attributes: { furigana: { base: 'x' } } },
		{ insert: 'c' }
	]))])
	const isMatch = (attr: any) => attr?.furigana?.base === 'x'

	test('resolves only the containing op, not adjacent matching ops', () => {
		expect(getOperationRange(doc, 0, isMatch)).toEqual([0, 1])
		expect(getOperationRange(doc, 1, isMatch)).toEqual([1, 2])
	})

	test('returns null when the containing op fails the predicate', () => {
		expect(getOperationRange(doc, 2, isMatch)).toBeNull()
	})

	test('returns null past the end of the document', () => {
		expect(getOperationRange(doc, 100, isMatch)).toBeNull()
	})
})
