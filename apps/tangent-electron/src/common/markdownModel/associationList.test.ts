import { describe, expect, test } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { matchAssociationListSeparator, type AssociationListLineData } from './associationList'
import { matchList } from './list'
import { markdownToTextDocument, parseMarkdown } from './parser'
import noteTypeset from './typewriterTypes'
import type { FormatType, LineType } from 'typewriter-editor/typesetting'
import { getLineFormattingPrefix, lineFormatEscapeMode, lineHasMultiLineContext } from './line'

describe('matchAssociationListSeparator', () => {
	test.each([
		['- term :: value', { index: 6, hasValue: true }],
		['- term\t::\tdefinition', { index: 6, hasValue: true }],
		['- term ::', { index: 6, hasValue: false }],
		['- term ::   ', { index: 6, hasValue: false }],
		['- term :: first :: second', { index: 6, hasValue: true }],
		['- `a :: b` :: value', { index: 10, hasValue: true }],
	])('matches %j', (source, expected) => {
		expect(matchAssociationListSeparator(source, matchList(source))).toEqual(expected)
	})

	test.each([
		'- term',
		'plain :: text',
		'- term:: value',
		'- term ::value',
		'- `term :: code`',
		'- [[Page :: detail]]',
		'- {term :: gloss}',
	])('does not match %j', source => {
		expect(matchAssociationListSeparator(source, matchList(source))).toBeNull()
	})
})

describe('association-list parsing', () => {
	test('marks term lines and hides the separator', () => {
		const [line] = parseMarkdown('- term :: value').lines
		expect(line.attributes.associationList).toMatchObject({ role: 'term', hasValue: true })
		expect(line.attributes.list).toBeUndefined()
		expect(line.content.ops.find(op => op.attributes?.association_separator)).toMatchObject({
			insert: ' :: ',
			attributes: { association_separator: true, hiddenGroup: '6-10' }
		})
	})

	test('marks only the first top-level separator on a term line', () => {
		const [line] = parseMarkdown('- term :: first :: second').lines
		const separators = line.content.ops.filter(op => op.attributes?.association_separator)

		expect(separators).toHaveLength(1)
		expect(separators[0].attributes.hiddenGroup).toBe('6-10')
		expect(line.content.ops.at(-1).insert).toBe('first :: second')
	})

	test('hides the space after the glyph together with the glyph', () => {
		for (const line of parseMarkdown('- term ::\n  - value').lines) {
			expect(line.content.ops.find(op => op.attributes?.line_format === 'associationList')).toMatchObject({
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

		expect(lines[0].attributes.associationList).toMatchObject({ role: 'term', hasValue: false })
		expect(lines[1].attributes.associationList).toMatchObject({ role: 'value', termIndent: '' })
		expect(lines[2].attributes.list).toBeTruthy()
		expect(lines[2].attributes.associationList).toBeUndefined()
		expect(lines[3].attributes.associationList).toMatchObject({ role: 'value', termIndent: '' })
	})

	test('does not attach values across a blank line or to an inline value', () => {
		const afterBlank = parseMarkdown('- term ::\n\n  - regular').lines
		expect(afterBlank[2].attributes.list).toBeTruthy()
		expect(afterBlank[2].attributes.associationList).toBeUndefined()

		const afterDefinition = parseMarkdown('- term :: value\n  - regular').lines
		expect(afterDefinition[1].attributes.list).toBeTruthy()
		expect(afterDefinition[1].attributes.associationList).toBeUndefined()
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
			expect(line.attributes.associationList).toBeUndefined()
			expect(line.content.ops.some(op => op.attributes?.association_separator)).toBe(false)
		}
	})

	test('marks the first separator after protected inline objects', () => {
		const [line] = parseMarkdown('- `code :: literal` $math :: literal$ :: final :: literal').lines
		const separators = line.content.ops.filter(op => op.attributes?.association_separator)

		expect(separators).toHaveLength(1)
		expect(separators[0].attributes.hiddenGroup).toBe('37-41')
	})

	test.each([
		'- **bold** :: *italic value*',
		'- term :: first :: second',
		'- term :: [linked value](https://example.com)',
		'- term :: `http://example.com/a::b`',
		'- [[Page :: detail]] :: value',
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
		const associationListLines = lines.filter(line => line.attributes.associationList)
		expect(associationListLines.map(line => (line.attributes.associationList as AssociationListLineData).rootIndent))
			.toEqual(['', '', '', '', '', ''])
		expect((associationListLines[2].attributes.associationList as AssociationListLineData).termIndent).toBe('')
		expect((associationListLines[3].attributes.associationList as AssociationListLineData).termIndent).toBe('  ')
	})

	test('keeps arbitrarily nested terms under an inline root', () => {
		const lines = parseMarkdown(`- root :: value
  - child :: value
    - grandchild ::
      - value`).lines
		const associationListLines = lines.map(line => line.attributes.associationList as AssociationListLineData)

		expect(associationListLines.map(associationList => associationList.rootIndent)).toEqual(['', '', '', ''])
		expect(associationListLines.map(associationList => associationList.termIndent)).toEqual([undefined, '', '  ', '    '])
	})

	test('participates in list continuation behavior', () => {
		const [line] = parseMarkdown('- term :: value').lines
		expect(lineHasMultiLineContext(line)).toBeTruthy()
		expect(getLineFormattingPrefix(line, true)).toBe('- ')
		expect(lineFormatEscapeMode(line)).toBe('single')
	})

	test.each(['*', '‣'])('accepts the supported %s list glyph', glyph => {
		const [line] = parseMarkdown(`${glyph} term :: value`).lines
		expect(line.attributes.associationList).toMatchObject({ role: 'term', hasValue: true })
	})
})

describe('association-list rendering', () => {
	const lineType = noteTypeset.lines.find(
		(type): type is LineType => typeof type !== 'string' && type.name === 'associationList'
	)
	const separatorFormat = noteTypeset.formats.find(
		(type): type is FormatType => typeof type !== 'string' && type.name === 'association_separator'
	)

	if (!lineType?.renderMultiple || !lineType.shouldCombine || !separatorFormat) {
		throw new Error('Association-list types are not registered')
	}

	const indent = (value: string) => ({ indent: value, indentSize: value.length })
	const glyph = matchList('- item')
	const makeSeparator = (inlineId = 'separator') => {
		const separator = separatorFormat.render({ association_separator: true, hiddenGroup: inlineId }, [' :: '], null, null) as any
		separatorFormat.postProcess?.(separator)
		return separator
	}
	const separator = makeSeparator()

	test('combines terms and direct values sharing a root indent', () => {
		const root = { associationList: { role: 'term', glyph, hasValue: true, rootIndent: '' }, indent: indent('') }
		const bare = { associationList: { role: 'term', glyph, hasValue: false, rootIndent: '' }, indent: indent('') }
		const value = { associationList: { role: 'value', glyph, termIndent: '', rootIndent: '' }, indent: indent('  ') }
		const nestedTerm = { associationList: { role: 'term', glyph, hasValue: true, rootIndent: '' }, indent: indent('  ') }

		expect(lineType.shouldCombine(root, bare)).toBe(true)
		expect(lineType.shouldCombine(root, value)).toBe(true)
		expect(lineType.shouldCombine(root, nestedTerm)).toBe(true)
	})

	test('renders semantic term and value elements', () => {
		const rendered = lineType.renderMultiple([
			[{ associationList: { role: 'term', glyph, hasValue: true, rootIndent: '' }, indent: indent('') }, ['alpha', separator, 'one'], 'a'],
			[{ associationList: { role: 'term', glyph, hasValue: false, rootIndent: '' }, indent: indent('') }, ['beta'], 'b'],
			[{ associationList: { role: 'value', glyph, termIndent: '', rootIndent: '' }, indent: indent('  ') }, ['first'], 'v1'],
			[{ associationList: { role: 'value', glyph, termIndent: '', rootIndent: '' }, indent: indent('  ') }, ['second'], 'v2'],
			[{ associationList: { role: 'term', glyph, hasValue: true, rootIndent: '' }, indent: indent('') }, ['gamma', separator, 'three'], 'c'],
		], null, true) as any

		expect(rendered.type).toBe('dl')
		expect(rendered.props.className).toBe('association-list')
		expect(rendered.children.map(child => child.type)).toEqual([
			'dt', 'dd', 'dt', 'dd', 'dd', 'dt', 'dd'
		])
		expect(rendered.children[0].children).toEqual(['alpha'])
		expect(rendered.children[1].children).toEqual(['one'])
		expect(rendered.children[3].props).toMatchObject({
			'data-association-list-role': 'value',
			'data-association-list-term-indent': ''
		})
	})

	test('renders everything after the separator as one value', () => {
		const emphasis = { type: 'em', props: {}, children: ['Sb'] }
		const rendered = lineType.renderMultiple([
			[{
				associationList: { role: 'term', glyph, hasValue: true, rootIndent: '' },
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
			props: { className: 'inline-association_separator-container', 'data-hidden-group': 'separator' },
			children: [
				{
					type: 'span',
					props: { className: 'association_separator-source hidden' },
					children: [' :: ']
				},
				{
					type: 'span',
					props: { className: 'association-list-separator-output' }
				}
			]
		})
	})
})
