import { describe, expect, test } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { scanGlossSpan } from './gloss'

function opsWith(source: string, key: string) {
	return parseMarkdown(source).lines[0].content.ops.filter(op => op.attributes?.[key])
}

describe('scanGlossSpan', () => {
	test.each([
		['{SGR::Select Graphic Rendition}', { base: 'SGR', description: 'Select Graphic Rendition' }],
		['{ SGR :: Select Graphic Rendition }', { base: 'SGR', description: 'Select Graphic Rendition' }],
		['{ \u{F12A7} :: U+F12A7 }', { base: '\u{F12A7}', description: 'U+F12A7' }],
		['{ 漢字 :: kanji }', { base: '漢字', description: 'kanji' }],
	])('parses %s', (source, gloss) => {
		expect(scanGlossSpan(source)).toEqual({ type: 'valid', end: source.length - 1, gloss })
	})

	test('padded and unpadded forms produce identical data', () => {
		expect(scanGlossSpan('{a::b c}')).toEqual({ ...scanGlossSpan('{  a  ::  b c  }'), end: 7 })
	})

	test('preserves internal whitespace', () => {
		expect(scanGlossSpan('{ two  words :: a  description }')).toMatchObject({
			gloss: { base: 'two  words', description: 'a  description' }
		})
	})

	test('the first separator wins', () => {
		expect(scanGlossSpan('{ term :: text :: more }')).toMatchObject({
			gloss: { base: 'term', description: 'text :: more' }
		})
	})

	test.each([
		['{a|b::c}', { base: 'a|b', description: 'c' }],
		['{a::b|c}', { base: 'a', description: 'b|c' }],
	])('a pipe is ordinary text: %s', (source, gloss) => {
		expect(scanGlossSpan(source)).toMatchObject({ type: 'valid', gloss })
	})

	test.each([
		['{C\\:\\:Users::path}', 'C::Users'],
		['{C\\::Users::path}', 'C::Users'],
		['{60fps \\| 120fps::rates}', '60fps | 120fps'],
		['{\\{x\\}::braces}', '{x}'],
	])('escapes stay literal in %s', (source, base) => {
		expect(scanGlossSpan(source)).toMatchObject({ type: 'valid', gloss: { base } })
	})

	test.each([
		'{no separator}',
		'{a|furigana}',
		'{unterminated::span',
		'{spans::a\nline}',
		'{outer {inner::x} y}',
		'{a::b\\\n}',
	])('%j is not a gloss', source => {
		expect(scanGlossSpan(source)).toEqual({ type: 'invalid' })
	})

	test.each(['{::description}', '{base::}', '{ :: }', '{::|c}'])('%j has a separator but an empty field', source => {
		expect(scanGlossSpan(source)).toEqual({ type: 'literal', end: source.length - 1 })
	})

	test('an escaped opener never starts a span', () => {
		expect(scanGlossSpan('\\{a::b}', 1)).toEqual({ type: 'invalid' })
	})
})

describe('gloss parsing', () => {
	test('stores the complete source as one attributed span', () => {
		const line = parseMarkdown('Before { SGR :: Select Graphic Rendition } after').lines[0]
		expect(line.content.ops.find(op => op.attributes?.gloss)).toEqual({
			insert: '{ SGR :: Select Graphic Rendition }',
			attributes: {
				gloss: { base: 'SGR', description: 'Select Graphic Rendition' },
				hiddenGroup: '7-42'
			}
		})
	})

	test('an unescaped :: takes precedence over furigana', () => {
		expect(opsWith('{a|b::c}', 'gloss')).toHaveLength(1)
		expect(opsWith('{a|b::c}', 'furigana')).toHaveLength(0)
	})

	test('an escaped :: leaves the span to furigana', () => {
		const [op] = opsWith('{a\\::b|c}', 'furigana')
		expect(op.attributes.furigana).toMatchObject({ base: 'a::b', reading: 'c' })
		expect(opsWith('{a\\::b|c}', 'gloss')).toHaveLength(0)
	})

	test('a span with :: but an empty field is neither gloss nor furigana', () => {
		expect(opsWith('{::|c}', 'gloss')).toHaveLength(0)
		expect(opsWith('{::|c}', 'furigana')).toHaveLength(0)
	})

	test('furigana still parses alongside gloss', () => {
		expect(opsWith('{漢字|かんじ} and {SGR::graphics}', 'furigana')).toHaveLength(1)
		expect(opsWith('{漢字|かんじ} and {SGR::graphics}', 'gloss')).toHaveLength(1)
	})

	test('adjacent identical spans get distinct inline ids', () => {
		const inlineIds = opsWith('{a::b}{a::b}', 'gloss').map(op => op.attributes.hiddenGroup)
		expect(inlineIds).toEqual(['0-6', '6-12'])
	})

	test('does not activate inside inline code', () => {
		expect(opsWith('`{a::b}`', 'gloss')).toHaveLength(0)
	})

	test('works inside formatting', () => {
		const [op] = opsWith('**{a::b}**', 'gloss')
		expect(op.attributes.bold).toBeTruthy()
	})

	test.each([
		'Plain {SGR::Select Graphic Rendition} text',
		'{ padded :: form } and {unpadded::form}',
		'Mixed {漢字|かんじ} and {term::description}',
		'Literal {::|c} and {base::}',
		'Escapes {C\\:\\:Users::path} and \\{not a gloss\\}',
	])('round-trips %j', source => {
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})
})
