import { describe, expect, test } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { matchDlSeparator, type DlLineData } from './dl'
import { matchList } from './list'
import { markdownToTextDocument, parseMarkdown } from './parser'
import noteTypeset from './typewriterTypes'
import type { FormatType, LineType } from 'typewriter-editor/typesetting'
import { getLineFormattingPrefix, lineFormatEscapeMode, lineHasMultiLineContext } from './line'

describe('matchDlSeparator', () => {
	test.each([
		['- term :: definition', { index: 6, hasDef: true }],
		['- term\t::\tdefinition', { index: 6, hasDef: true }],
		['- term ::', { index: 6, hasDef: false }],
		['- term ::   ', { index: 6, hasDef: false }],
		['- term :: first :: second', { index: 6, hasDef: true }],
		['- `a :: b` :: definition', { index: 10, hasDef: true }],
	])('matches %j', (source, expected) => {
		expect(matchDlSeparator(source, matchList(source))).toEqual(expected)
	})

	test.each([
		'- term',
		'plain :: text',
		'- term:: definition',
		'- term ::definition',
		'- `term :: code`',
		'- [[Page :: detail]]',
		'- {term :: gloss}',
	])('does not match %j', source => {
		expect(matchDlSeparator(source, matchList(source))).toBeNull()
	})
})

describe('description-list parsing', () => {
	test('marks term lines and hides the separator', () => {
		const [line] = parseMarkdown('- term :: definition').lines
		expect(line.attributes.dl).toMatchObject({ role: 'term', hasDef: true })
		expect(line.attributes.list).toBeUndefined()
		expect(line.content.ops.find(op => op.attributes?.dl_sep)).toMatchObject({
			insert: ' :: ',
			attributes: { dl_sep: true, hiddenGroup: '6-10' }
		})
	})

	test('marks only the first top-level separator on a term line', () => {
		const [line] = parseMarkdown('- term :: first :: second').lines
		const separators = line.content.ops.filter(op => op.attributes?.dl_sep)

		expect(separators).toHaveLength(1)
		expect(separators[0].attributes.hiddenGroup).toBe('6-10')
		expect(line.content.ops.at(-1).insert).toBe('first :: second')
	})

	test('hides the space after the glyph together with the glyph', () => {
		for (const line of parseMarkdown('- term ::\n  - value').lines) {
			expect(line.content.ops.find(op => op.attributes?.line_format === 'dl')).toMatchObject({
				insert: '- ',
				attributes: { hidden: true }
			})
		}
	})

	test('marks only direct children of a bare term as values', () => {
		const lines = parseMarkdown(`- term ::
  - first value
    - nested list
  - second value`).lines

		expect(lines[0].attributes.dl).toMatchObject({ role: 'term', hasDef: false })
		expect(lines[1].attributes.dl).toMatchObject({ role: 'value', termIndent: '' })
		expect(lines[2].attributes.list).toBeTruthy()
		expect(lines[2].attributes.dl).toBeUndefined()
		expect(lines[3].attributes.dl).toMatchObject({ role: 'value', termIndent: '' })
	})

	test('does not attach values across a blank line or to an inline definition', () => {
		const afterBlank = parseMarkdown('- term ::\n\n  - regular').lines
		expect(afterBlank[2].attributes.list).toBeTruthy()
		expect(afterBlank[2].attributes.dl).toBeUndefined()

		const afterDefinition = parseMarkdown('- term :: definition\n  - regular').lines
		expect(afterDefinition[1].attributes.list).toBeTruthy()
		expect(afterDefinition[1].attributes.dl).toBeUndefined()
	})

	test('ignores separators consumed by other inline objects', () => {
		for (const source of [
			'- `term :: code`',
			'- $term :: math$',
			'- $$term :: math$$',
			'- [[Page :: detail]]',
			'- {term :: gloss}',
		]) {
			const [line] = parseMarkdown(source).lines
			expect(line.attributes.list).toBeTruthy()
			expect(line.attributes.dl).toBeUndefined()
			expect(line.content.ops.some(op => op.attributes?.dl_sep)).toBe(false)
		}
	})

	test('marks the first separator after protected inline objects', () => {
		const [line] = parseMarkdown('- `code :: literal` $math :: literal$ :: final :: literal').lines
		const separators = line.content.ops.filter(op => op.attributes?.dl_sep)

		expect(separators).toHaveLength(1)
		expect(separators[0].attributes.hiddenGroup).toBe('37-41')
	})

	test.each([
		'- **bold** :: *italic definition*',
		'- term :: first :: second',
		'- term :: [linked definition](https://example.com)',
		'- term :: `http://example.com/a::b`',
		'- [[Page :: detail]] :: definition',
	])('round-trips %j', source => {
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	test('keeps mixed terms and values in the same root group', () => {
		const lines = parseMarkdown(`- a :: 1
- b ::
  - nested ::
    - nested value
  - sibling value
- c :: 3`).lines
		const dlLines = lines.filter(line => line.attributes.dl)
		expect(dlLines.map(line => (line.attributes.dl as DlLineData).rootIndent))
			.toEqual(['', '', '', '', '', ''])
		expect((dlLines[2].attributes.dl as DlLineData).termIndent).toBe('')
		expect((dlLines[3].attributes.dl as DlLineData).termIndent).toBe('  ')
	})

	test('keeps arbitrarily nested terms under an inline root', () => {
		const lines = parseMarkdown(`- root :: description
  - child :: description
    - grandchild ::
      - value`).lines
		const dlLines = lines.map(line => line.attributes.dl as DlLineData)

		expect(dlLines.map(dl => dl.rootIndent)).toEqual(['', '', '', ''])
		expect(dlLines.map(dl => dl.termIndent)).toEqual([undefined, '', '  ', '    '])
	})

	test('participates in list continuation behavior', () => {
		const [line] = parseMarkdown('- term :: definition').lines
		expect(lineHasMultiLineContext(line)).toBeTruthy()
		expect(getLineFormattingPrefix(line, true)).toBe('- ')
		expect(lineFormatEscapeMode(line)).toBe('single')
	})

	test.each(['*', '‣'])('accepts the supported %s list glyph', glyph => {
		const [line] = parseMarkdown(`${glyph} term :: definition`).lines
		expect(line.attributes.dl).toMatchObject({ role: 'term', hasDef: true })
	})
})

describe('description-list rendering', () => {
	const lineType = noteTypeset.lines.find(
		(type): type is LineType => typeof type !== 'string' && type.name === 'dl'
	)
	const separatorFormat = noteTypeset.formats.find(
		(type): type is FormatType => typeof type !== 'string' && type.name === 'dl_sep'
	)

	if (!lineType?.renderMultiple || !lineType.shouldCombine || !separatorFormat) {
		throw new Error('Description-list types are not registered')
	}

	const indent = (value: string) => ({ indent: value, indentSize: value.length })
	const glyph = matchList('- item')
	const makeSeparator = (inlineId = 'separator') => {
		const separator = separatorFormat.render({ dl_sep: true, hiddenGroup: inlineId }, [' :: '], null, null) as any
		separatorFormat.postProcess?.(separator)
		return separator
	}
	const separator = makeSeparator()

	test('combines terms and direct values sharing a root indent', () => {
		const root = { dl: { role: 'term', glyph, hasDef: true, rootIndent: '' }, indent: indent('') }
		const bare = { dl: { role: 'term', glyph, hasDef: false, rootIndent: '' }, indent: indent('') }
		const value = { dl: { role: 'value', glyph, termIndent: '', rootIndent: '' }, indent: indent('  ') }
		const nestedTerm = { dl: { role: 'term', glyph, hasDef: true, rootIndent: '' }, indent: indent('  ') }

		expect(lineType.shouldCombine(root, bare)).toBe(true)
		expect(lineType.shouldCombine(root, value)).toBe(true)
		expect(lineType.shouldCombine(root, nestedTerm)).toBe(true)
	})

	test('renders semantic term and definition elements', () => {
		const rendered = lineType.renderMultiple([
			[{ dl: { role: 'term', glyph, hasDef: true, rootIndent: '' }, indent: indent('') }, ['alpha', separator, 'one'], 'a'],
			[{ dl: { role: 'term', glyph, hasDef: false, rootIndent: '' }, indent: indent('') }, ['beta'], 'b'],
			[{ dl: { role: 'value', glyph, termIndent: '', rootIndent: '' }, indent: indent('  ') }, ['first'], 'v1'],
			[{ dl: { role: 'value', glyph, termIndent: '', rootIndent: '' }, indent: indent('  ') }, ['second'], 'v2'],
			[{ dl: { role: 'term', glyph, hasDef: true, rootIndent: '' }, indent: indent('') }, ['gamma', separator, 'three'], 'c'],
		], null, true) as any

		expect(rendered.type).toBe('dl')
		expect(rendered.props.className).toBe('description-list')
		expect(rendered.children.map(child => child.type)).toEqual([
			'dt', 'dd', 'dt', 'dd', 'dd', 'dt', 'dd'
		])
		expect(rendered.children[0].children).toEqual(['alpha'])
		expect(rendered.children[1].children).toEqual(['one'])
		expect(rendered.children[3].props).toMatchObject({
			'data-dl-role': 'value',
			'data-dl-term-indent': ''
		})
	})

	test('renders everything after the separator as one definition', () => {
		const emphasis = { type: 'em', props: {}, children: ['Sb'] }
		const rendered = lineType.renderMultiple([
			[{
				dl: { role: 'term', glyph, hasDef: true, rootIndent: '' },
				indent: indent('')
			}, ['symbol', separator, 'earth :: ', emphasis], 'a']
		], null, true) as any

		expect(rendered.children.map(child => child.type)).toEqual(['dt', 'dd'])
		expect(rendered.children.map(child => child.children)).toEqual([
			['symbol'],
			['earth :: ', emphasis]
		])
	})

	test('renders the separator as hidden source syntax', () => {
		expect(separator).toMatchObject({
			type: 'span',
			props: { className: 'inline-dl_sep-container', 'data-hidden-group': 'separator' },
			children: [
				{
					type: 'span',
					props: { className: 'dl_sep-source hidden' },
					children: [' :: ']
				},
				{
					type: 'span',
					props: { className: 'dl-separator-output' }
				}
			]
		})
	})
})
