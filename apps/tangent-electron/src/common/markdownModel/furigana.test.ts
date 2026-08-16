import { describe, expect, test } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { parseFuriganaSpan } from './furigana'
import noteTypeset from './typewriterTypes'

describe('parseFuriganaSpan', () => {
	test.each([
		['{ 漢字 | かんじ }', { base: '漢字', reading: 'かんじ' }],
		['{ é | combining }', { base: 'é', reading: 'combining' }],
	])('parses %s', (source, furigana) => {
		expect(parseFuriganaSpan(source)).toEqual({
			end: source.length - 1,
			furigana
		})
	})

	test('escaped separators remain literal display text', () => {
		expect(parseFuriganaSpan('{ Foo\\|Bar | フーバー }')?.furigana).toEqual({
			base: 'Foo|Bar',
			reading: 'フーバー'
		})
	})

	test('uses the first separator', () => {
		expect(parseFuriganaSpan('{ term | text | more }')?.furigana).toEqual({
			base: 'term',
			reading: 'text | more'
		})
	})

	test.each([
		'{ no separator }',
		'{ | reading }',
		'{ base | }',
		'{ base | reading',
		'{ base |\n reading }',
		'\\{ base | reading }',
		'{{ nested | reading } | more }',
	])('rejects malformed or inactive source: %s', source => {
		expect(parseFuriganaSpan(source)).toBeNull()
	})

	test('balances escaped braces without treating them as nesting', () => {
		expect(parseFuriganaSpan('{ \\{base\\} | reading }')?.furigana).toEqual({
			base: '{base}',
			reading: 'reading'
		})
	})

	test('does not let trim consume half of a trailing escape pair', () => {
		expect(parseFuriganaSpan('{ base | reading\\ }')?.furigana).toEqual({
			base: 'base',
			reading: 'reading '
		})
	})

	test('unescapes any escaped character except another backslash', () => {
		expect(parseFuriganaSpan('{ back\\\\slash | \\a }')?.furigana).toEqual({
			base: 'back\\slash',
			reading: 'a'
		})
	})

	test('a backslash cannot escape another backslash', () => {
		// The rightmost of the pair still escapes whatever follows it (here,
		// the trailing space that would otherwise be trimmed) - a run of
		// backslashes resolves left to right, never by parity of the whole run.
		expect(parseFuriganaSpan('{ base | x\\\\ }')?.furigana).toEqual({
			base: 'base',
			reading: 'x\\ '
		})
	})
})

describe('furigana markdown parsing', () => {
	test.each([
		'Before { 漢字 | かんじ } after',
		'**bold { 字 | じ } text**',
		'`{ code | inactive }`',
		'```\n{ fenced | inactive }\n```',
		'\\{ escaped | opener }',
	])('round-trips %s', source => {
		const document = markdownToTextDocument(source)
		expect(typewriterToText(document)).toBe(source)
	})

	test('stores the complete source as one attributed span', () => {
		const source = 'Before { 漢字 | かんじ } after'
		const line = parseMarkdown(source).lines[0]
		const furiganaOp = line.content.ops.find(op => op.attributes?.furigana)

		expect(furiganaOp).toEqual({
			insert: '{ 漢字 | かんじ }',
			attributes: {
				furigana: {
					base: '漢字',
					reading: 'かんじ'
				},
				hiddenGroup: true
			}
		})
	})

	test('escaped opener hides its backslash without activating furigana', () => {
		const line = parseMarkdown('\\{ base | reading }').lines[0]
		expect(line.content.ops.some(op => op.attributes?.furigana)).toBe(false)
		expect(line.content.ops[0]).toEqual({
			insert: '\\',
			attributes: { link_internal: true, hidden: true }
		})
	})

	test('does not activate in inline or fenced code', () => {
		const inline = parseMarkdown('`{ code | inactive }`').lines[0]
		expect(inline.content.ops.some(op => op.attributes?.furigana)).toBe(false)

		const fenced = parseMarkdown('```\n{ fenced | inactive }\n```').lines[1]
		expect(fenced.content.ops.some(op => op.attributes?.furigana)).toBe(false)
	})
})

describe('furigana rendering', () => {
	const furiganaFormat = noteTypeset.formats.find(
		format => typeof format !== 'string' && format.name === 'furigana'
	)
	if (!furiganaFormat || typeof furiganaFormat === 'string') {
		throw new Error('Furigana format is not registered')
	}

	test('renders a t-furigana element carrying base/reading', () => {
		const rendered = furiganaFormat.render({
			furigana: { base: '漢字', reading: 'かんじ' }
		}, ['source'], null, null) as any

		expect(rendered.children[1]).toMatchObject({
			type: 't-furigana',
			props: {
				base: '漢字',
				reading: 'かんじ'
			}
		})
	})

	test('marks source revealed while editing, output unaffected', () => {
		const rendered = furiganaFormat.render({
			furigana: { base: '字', reading: 'じ' },
			revealed: true
		}, ['source'], null, null) as any

		expect(rendered.props.className).toContain('revealed')
		expect(rendered.children[0].props.className).toContain('revealed')
		expect(rendered.children[1].type).toBe('t-furigana')

		const unrevealed = furiganaFormat.render({
			furigana: { base: '字', reading: 'じ' }
		}, ['source'], null, null) as any

		expect(unrevealed.children[1].type).toBe('t-furigana')
	})
})
