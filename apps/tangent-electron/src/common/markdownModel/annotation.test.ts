import { describe, expect, test } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { parseAnnotationSpan } from './annotation'
import noteTypeset from './typewriterTypes'

describe('parseAnnotationSpan', () => {
	test.each([
		['{ 漢字 | かんじ }', { kind: 'ruby', base: '漢字', annotation: 'かんじ' }],
		['{ 󱊧 :: U+F12A7 }', { kind: 'description', base: '󱊧', annotation: 'U+F12A7' }],
		['{ é | combining }', { kind: 'ruby', base: 'é', annotation: 'combining' }],
		['{ ✈️ :: airplane }', { kind: 'description', base: '✈️', annotation: 'airplane' }],
	])('parses %s', (source, annotation) => {
		expect(parseAnnotationSpan(source)).toEqual({
			end: source.length - 1,
			annotation
		})
	})

	test('description takes precedence over ruby regardless of position', () => {
		expect(parseAnnotationSpan('{ Foo::Bar | フーバー }')?.annotation).toEqual({
			kind: 'description',
			base: 'Foo',
			annotation: 'Bar | フーバー'
		})
	})

	test('escaped separators remain literal display text', () => {
		expect(parseAnnotationSpan('{ Foo\\::Bar | フーバー }')?.annotation).toEqual({
			kind: 'ruby',
			base: 'Foo::Bar',
			annotation: 'フーバー'
		})
		expect(parseAnnotationSpan('{ term :: one \\| two }')?.annotation).toEqual({
			kind: 'description',
			base: 'term',
			annotation: 'one | two'
		})
	})

	test('uses the first separator of the selected kind', () => {
		expect(parseAnnotationSpan('{ term :: text :: more }')?.annotation).toEqual({
			kind: 'description',
			base: 'term',
			annotation: 'text :: more'
		})
	})

	test.each([
		'{ no operator }',
		'{ | reading }',
		'{ base | }',
		'{ base :: }',
		'{ base | reading',
		'{ base |\n reading }',
		'\\{ base | reading }',
		'{{ nested | reading } :: description }',
	])('rejects malformed or inactive source: %s', source => {
		expect(parseAnnotationSpan(source)).toBeNull()
	})

	test('balances escaped braces without treating them as nesting', () => {
		expect(parseAnnotationSpan('{ \\{base\\} | reading }')?.annotation).toEqual({
			kind: 'ruby',
			base: '{base}',
			annotation: 'reading'
		})
	})
})

describe('annotation markdown parsing', () => {
	test.each([
		'Before { 漢字 | かんじ } after',
		'{ 󱊧 :: U+F12A7 (Material Design Icons Hexadecimal) }',
		'**bold { 字 | じ } text**',
		'`{ code | inactive }`',
		'```\n{ fenced | inactive }\n```',
	])('round-trips %s', source => {
		const document = markdownToTextDocument(source)
		expect(typewriterToText(document)).toBe(source)
	})

	test('stores the complete source as one attributed span', () => {
		const source = 'Before { 漢字 | かんじ } after'
		const line = parseMarkdown(source).lines[0]
		const annotationOp = line.content.ops.find(op => op.attributes?.annotation)

		expect(annotationOp).toEqual({
			insert: '{ 漢字 | かんじ }',
			attributes: {
				annotation: {
					kind: 'ruby',
					base: '漢字',
					annotation: 'かんじ'
				},
				hiddenGroup: true
			}
		})
	})

	test('does not activate in inline or fenced code', () => {
		const inline = parseMarkdown('`{ code | inactive }`').lines[0]
		expect(inline.content.ops.some(op => op.attributes?.annotation)).toBe(false)

		const fenced = parseMarkdown('```\n{ fenced | inactive }\n```').lines[1]
		expect(fenced.content.ops.some(op => op.attributes?.annotation)).toBe(false)
	})
})

describe('annotation rendering', () => {
	const annotationFormat = noteTypeset.formats.find(
		format => typeof format !== 'string' && format.name === 'annotation'
	)
	if (!annotationFormat || typeof annotationFormat === 'string') {
		throw new Error('Annotation format is not registered')
	}

	test('renders ruby with a native rt element', () => {
		const rendered = annotationFormat.render({
			annotation: { kind: 'ruby', base: '漢字', annotation: 'かんじ' }
		}, ['source'], null, null) as any

		expect(rendered.children[1]).toMatchObject({
			type: 'ruby',
			children: [
				'漢字',
				{ type: 'rt', children: ['かんじ'] }
			]
		})
	})

	test('renders descriptions through the interactive custom element', () => {
		const rendered = annotationFormat.render({
			annotation: { kind: 'description', base: '<term>', annotation: 'A & B' }
		}, ['source'], null, null) as any

		expect(rendered.children[1]).toMatchObject({
			type: 't-annotation',
			props: {
				base: '<term>',
				description: 'A & B',
				tabindex: 0,
				title: 'A & B'
			},
			children: [
				'<term>',
				{ type: 'sup', children: ['ⓘ'] }
			]
		})
	})

	test('marks source revealed and output hideable while editing', () => {
		const rendered = annotationFormat.render({
			annotation: { kind: 'ruby', base: '字', annotation: 'じ' },
			revealed: true
		}, ['source'], null, null) as any

		expect(rendered.props.className).toContain('revealed')
		expect(rendered.children[0].props.className).toContain('revealed')
		expect(rendered.children[1].props.className).toBe('inline-annotation-output')
	})
})
