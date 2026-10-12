import { describe, expect, it } from 'vitest'
import { TextDocument } from '@typewriter/document'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { isSeparatorRow, matchTableRow, parseColumnAlignment } from './table'

describe('Table rows', () => {
	it.each([
		['| a | b |', ['a', 'b']],
		['  | a | b  ', ['a', 'b']],
		['| | |', ['', '']],
		['|', ['']],
		['| a\\|b | c |', ['a\\|b', 'c']],
		['| a\\\\| b |', ['a\\\\', 'b']],
		['| a\\\\\\|b |', ['a\\\\\\|b']],
		['a | b', null],
		['a\tb', null]
	])('splits %s', (text, cells) => {
		expect(matchTableRow(text)).toEqual(cells)
	})

	it('recognizes separator cells and alignment', () => {
		const cells = [':---', ':---:', '---:', '---']
		expect(isSeparatorRow(cells)).toBe(true)
		expect(parseColumnAlignment(cells)).toEqual(['left', 'center', 'right', null])
		expect(isSeparatorRow(['---', 'text'])).toBe(false)
		expect(isSeparatorRow(['', '---'])).toBe(false)
		expect(isSeparatorRow([])).toBe(false)
	})
})

describe('Table parsing', () => {
	it.each([
		'| A | B |\n| --- | --- |\n| a | b |',
		'| a | b |',
		'| A | B |\n| :--- | ---: |\n| a | b |',
		'before\n| A |\n| --- |\n| a |\nafter',
		'  | A |\n  | --- |\n  | a |',
		'| **bold** | [[link]] | {字|じ} |\n| a\\|b | |',
		'| A |\n| --- |\n\n| B |',
		'| A |\n# Heading\n| B |',
		'| A |\n'
	])('preserves source: %s', text => {
		const doc = markdownToTextDocument(text)
		expect(typewriterToText(doc)).toBe(text)
		for (const line of doc.lines) {
			const raw = typewriterToText(new TextDocument([line]))
			if (matchTableRow(raw)) expect(line.attributes.table.rawContent).toBe(raw)
			else expect(line.attributes.table).toBeUndefined()
		}
	})

	it('groups adjacent rows and separates distinct tables', () => {
		const doc = markdownToTextDocument('| A |\n| --- |\n| a |\n\n| B |')
		expect(doc.lines.slice(0, 3).map(line => line.attributes.table.id)).toEqual([0, 0, 0])
		expect(doc.lines[1].attributes.table.rowType).toBe('separator')
		expect(doc.lines[4].attributes.table.id).toBe(4)
	})

	it('leaves cell formatting literal and code blocks unaffected', () => {
		const doc = markdownToTextDocument('| **a** |\n```\n| code |\n```')
		expect(doc.lines[0].content.ops).toEqual([{ insert: '| **a** |', attributes: {} }])
		expect(doc.lines[2].attributes.table).toBeUndefined()
		expect(doc.lines[2].attributes.code).toBeDefined()
	})

	it('reparses adjacent rows during a scoped edit', () => {
		const doc = markdownToTextDocument('before\n| A |\n| --- |\n| a |\nafter')
		const result = parseMarkdown(doc, { documentStartLine: 2, documentEndLine: 2 })
		expect(result.startLineIndex).toBe(1)
		expect(result.lines.map(line => line.attributes.table.id)).toEqual([1, 1, 1])
	})
})
