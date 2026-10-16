import { describe, expect, test } from 'vitest'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { getLineFormattingPrefix } from './line'
import { collapseSection, compareSectionDepth, isLineCollapsible } from './sections'
import { typewriterToText } from 'common/typewriterUtils'

describe('portable Association Lists', () => {
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
