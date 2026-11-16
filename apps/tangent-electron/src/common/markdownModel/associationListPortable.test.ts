import { describe, expect, test } from 'vitest'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { getLineFormattingPrefix } from './line'
import { collapseSection, compareSectionDepth, isLineCollapsible } from './sections'
import { typewriterToText } from 'common/typewriterUtils'
import { TextDocument } from '@typewriter/document'

describe('portable Association Lists', () => {
	test.each(['  ', '\t'])('nests colon terms and values using %j indentation', indent => {
		const source = `Catalog ::\n: First ::\n${indent}: Chapter ::\n${indent}${indent}: A nested value\n${indent}: Another chapter ::\n${indent}${indent}: Another value\n: Second ::\n${indent}: A sibling value\n: A root value\nNext ::\n: A separate value`
		const document = markdownToTextDocument(source)
		expect(document.lines.map(line => line.attributes.associationList?.role)).toEqual([
			'term', 'term', 'term', 'value', 'term', 'value', 'term', 'value', 'value', 'term', 'value'
		])
		expect(document.lines.map(line => line.attributes.associationList?.termIndent)).toEqual([
			undefined, '', ':', indent + ':', ':', indent + ':', '', ':', '', undefined, ''
		])
		expect(typewriterToText(document)).toBe(source)
		expect(Object.keys(collapseSection(document, document.lines[1]))).toEqual(document.lines.slice(1, 6).map(line => line.id))
		expect(Object.keys(collapseSection(document, document.lines[0]))).toEqual(document.lines.slice(0, 9).map(line => line.id))
	})

	test('retains inline separators in colon values as literal source', () => {
		const document = markdownToTextDocument('Catalog ::\n: First ::\n  : Chapter :: A literal description')
		expect(document.lines[2].attributes.associationList).toMatchObject({ role: 'value', termIndent: ':' })
		expect(document.lines[2].content.ops.some(op => op.attributes?.association_separator)).toBe(false)
	})

	test('handles quoted colon terms, nested list terms and continuation', () => {
		const document = markdownToTextDocument('Catalog ::\n: First ::\n  - Chapter ::\n    : A value')
		expect(document.lines.map(line => line.attributes.associationList?.role)).toEqual(['term', 'term', 'term', 'value'])
		expect(document.lines[2].attributes.associationList.termIndent).toBe(':')
		expect(document.lines[3].attributes.associationList.termIndent).toBe('  ')
		const quoted = markdownToTextDocument('> Catalog ::\n> : First ::')
		expect(quoted.lines[1].attributes.associationList).toMatchObject({ role: 'term', marker: ':', termIndent: '' })
		expect(getLineFormattingPrefix(quoted.lines[1], true)).toBe('> : ')
	})

	test.each([' ::', ''])('incrementally reparses nested ownership when a colon term becomes %j', suffix => {
		const source = 'Catalog ::\n: First\n  : A value\n: Second ::\n  : Another value'
		const initial = markdownToTextDocument(source)
		const offset = source.indexOf('First') + 'First'.length
		const withTerm = initial.apply(initial.change.insert(offset, ' ::'))
		const parsed = new TextDocument(parseMarkdown(withTerm, { documentStartLine: 1, documentEndLine: 1 }).lines)
		expect(parsed.lines[2].attributes.associationList?.termIndent).toBe(':')
		const edited = suffix ? parsed : parsed.apply(parsed.change.delete([offset, offset + 3]))
		const result = parseMarkdown(edited, { documentStartLine: 1, documentEndLine: 1 })
		const full = markdownToTextDocument(typewriterToText(edited))
		expect(result.lines.map(line => line.attributes)).toEqual(full.lines.map(line => line.attributes))
	})

	test.each([
		'requires ::\n: electron\n: npm\n: typewriter',
		'- requires ::\n: electron\n: npm\n: typewriter',
		'requires ::\n\t- electron\n\t- npm\n\t- typewriter',
		'requires ::\n  : electron\n  : npm\n  : typewriter',
		'> requires ::\n> : electron\n> : npm\n> : typewriter',
	])('attaches values and preserves %j', source => {
		const document = markdownToTextDocument(source)
		expect(document.lines.map(line => line.attributes.associationList?.role)).toEqual(['term', 'value', 'value', 'value'])
		expect(document.lines.slice(1).map(line => line.attributes.associationList.termIndent)).toEqual(['', '', ''])
		expect(typewriterToText(document)).toBe(source)
	})

	test('combines bare terms, nested terms and colon values', () => {
		const document = markdownToTextDocument('Earth ::\nTerra ::\n: Our home\n\nSystem ::\n\tPlanet ::\n\t: A nested value')
		expect(document.lines.map(line => line.attributes.associationList?.role)).toEqual(['term', 'term', 'value', undefined, 'term', 'term', 'value'])
		expect(document.lines[5].attributes.associationList).toMatchObject({ rootIndent: '', termIndent: '' })
		expect(document.lines[6].attributes.associationList).toMatchObject({ rootIndent: '', termIndent: '\t' })
	})

	test.each([
		'ordinary :: prose',
		'ordinary :: prose ::',
		'`code ::`',
		'$math ::$',
		'[[Page ::]]',
		'{base :: gloss}',
		'[label ::](https://example.org)',
		'escaped \\::',
		'# Heading ::',
		'```js ::\ninside ::\n```',
		'$$\ninside ::\n$$',
		'---\nfield: inside ::\n---',
	])('keeps other constructs out of the list: %j', source => {
		expect(markdownToTextDocument(source).lines.every(line => !line.attributes.associationList)).toBe(true)
	})

	test.each([
		': no owner',
		'term ::\n\n: after blank',
		'term :: inline\n: after inline value',
		'term ::\nparagraph\n: after paragraph',
		'term ::\n:: not a marker',
		'term ::\n::: not a marker',
		'term ::\n:value without a space',
		'> term ::\n: outside quote',
	])('leaves an unowned colon line as prose: %j', source => {
		expect(markdownToTextDocument(source).lines.at(-1).attributes.associationList).toBeUndefined()
	})

	test('hides exactly the colon and one following whitespace character', () => {
		const document = markdownToTextDocument('term ::\n:\tvalue')
		expect(document.lines[1].content.ops[0]).toMatchObject({ insert: ':\t', attributes: { line_format: 'associationList', hidden: true } })
	})

	test('continues colon markers and preserves plain-term indentation', () => {
		const document = markdownToTextDocument('\tterm ::\n\t: value\n\t: ')
		expect(document.lines.map(line => getLineFormattingPrefix(line, true))).toEqual(['\t', '\t: ', '\t: '])
		const quoted = markdownToTextDocument('> term ::\n> : value')
		expect(getLineFormattingPrefix(quoted.lines[1], true)).toBe('> : ')
	})

	test('collapses same-indent values without consuming the next term', () => {
		const document = markdownToTextDocument('first ::\n: one\n: two\nsecond ::\n: three')
		expect(compareSectionDepth(document.lines[0], document.lines[1])).toBeLessThan(0)
		expect(compareSectionDepth(document.lines[1], document.lines[0])).toBeGreaterThan(0)
		expect(document.lines.map((_line, index) => isLineCollapsible(document.lines, index))).toEqual([true, false, false, true, false])
		expect(Object.keys(collapseSection(document, document.lines[0])))
			.toEqual(document.lines.slice(0, 3).map(line => line.id))
	})

	test.each(['term', '- term'])('reparses following prose markers when %j becomes a bare term', term => {
		const document = markdownToTextDocument(term + '\n: one\n: two')
		const edited = document.apply(document.change.insert(term.length, ' ::'))
		const result = parseMarkdown(edited, { documentStartLine: 0, documentEndLine: 0 })
		expect(result.lines.map(line => line.attributes.associationList?.role)).toEqual(['term', 'value', 'value'])
	})

	test('removes value ownership when the term marker is deleted', () => {
		const document = markdownToTextDocument('term ::\n: one\n: two')
		const edited = document.apply(document.change.delete([4, 7]))
		const result = parseMarkdown(edited, { documentStartLine: 0, documentEndLine: 0 })
		expect(result.lines.every(line => !line.attributes.associationList)).toBe(true)
	})
})
