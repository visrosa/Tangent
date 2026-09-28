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
		['- term :: definition', { hasDef: true }],
		['- term ::', { hasDef: false }],
		['- term ::   ', { hasDef: false }],
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
			attributes: { dl_sep: true, hidden: true }
		})
	})

	test('uses only the first separator on a term line', () => {
		const [line] = parseMarkdown('- term :: definition :: literal').lines
		expect(line.content.ops.filter(op => op.attributes?.dl_sep)).toHaveLength(1)
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
			'- [[Page :: detail]]',
			'- {term :: gloss}',
		]) {
			const [line] = parseMarkdown(source).lines
			expect(line.attributes.list).toBeTruthy()
			expect(line.attributes.dl).toBeUndefined()
			expect(line.content.ops.some(op => op.attributes?.dl_sep)).toBe(false)
		}
	})

	test.each([
		'- **bold** :: *italic definition*',
		'- term :: [linked definition](https://example.com)',
		'- term :: `http://example.com/a::b`',
		'- [[Page :: detail]] :: definition',
	])('round-trips %j', source => {
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	test('keeps mixed terms and values in the same root group', () => {
		const lines = parseMarkdown(`- a :: 1
- b ::
  - v1
  - v2
- c :: 3`).lines
		const rootIndents = lines.map(line => {
			const dl = line.attributes.dl as DlLineData
			return dl.role === 'term' ? line.attributes.indent.indent : dl.termIndent
		})
		expect(rootIndents).toEqual(['', '', '', '', ''])
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
	const separator = separatorFormat.render({ dl_sep: true, hidden: true }, [' :: '], null, null)

	test('combines terms and direct values sharing a root indent', () => {
		const root = { dl: { role: 'term', glyph, hasDef: true }, indent: indent('') }
		const bare = { dl: { role: 'term', glyph, hasDef: false }, indent: indent('') }
		const value = { dl: { role: 'value', glyph, termIndent: '' }, indent: indent('  ') }
		const nestedTerm = { dl: { role: 'term', glyph, hasDef: true }, indent: indent('  ') }

		expect(lineType.shouldCombine(root, bare)).toBe(true)
		expect(lineType.shouldCombine(root, value)).toBe(true)
		expect(lineType.shouldCombine(root, nestedTerm)).toBe(false)
	})

	test('renders semantic term and definition elements', () => {
		const rendered = lineType.renderMultiple([
			[{ dl: { role: 'term', glyph, hasDef: true }, indent: indent('') }, ['alpha', separator, 'one'], 'a'],
			[{ dl: { role: 'term', glyph, hasDef: false }, indent: indent('') }, ['beta'], 'b'],
			[{ dl: { role: 'value', glyph, termIndent: '' }, indent: indent('  ') }, ['first'], 'v1'],
			[{ dl: { role: 'value', glyph, termIndent: '' }, indent: indent('  ') }, ['second'], 'v2'],
			[{ dl: { role: 'term', glyph, hasDef: true }, indent: indent('') }, ['gamma', separator, 'three'], 'c'],
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

	test('renders the separator as hidden source syntax', () => {
		expect(separator).toMatchObject({
			type: 'span',
			props: { class: 'dl_sep hidden' }
		})
	})
})
