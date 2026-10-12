import { describe, expect, it } from 'vitest'
import { TextDocument } from '@typewriter/document'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { isSeparatorRow, matchTableRow, parseColumnAlignment, parsePipeTable, type TableModel } from './table'

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
			if (matchTableRow(raw)) expect(line.attributes.table.source.split('\n')).toContain(raw)
			else expect(line.attributes.table).toBeUndefined()
		}
	})

	it('groups adjacent rows and separates distinct tables', () => {
		const doc = markdownToTextDocument('| A |\n| --- |\n| a |\n\n| B |')
		expect(doc.lines.slice(0, 3).map(line => line.attributes.table.id)).toEqual([0, 0, 0])
		expect(doc.lines[1].attributes.table.model.head).toHaveLength(1)
		expect(doc.lines[4].attributes.table.id).toBe(4)
	})

	it('leaves cell formatting literal and code blocks unaffected', () => {
		const doc = markdownToTextDocument('| **a** |\n```\n| code |\n```')
		expect(doc.lines[0].content.ops).toEqual([{ insert: '| **a** |', attributes: { hidden: true, line_format: 'table' } }])
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

describe('Table model', () => {
	it('normalizes pipe cells independently of source rows', () => {
		const model = parsePipeTable('| A | B |\n| :--- | ---: |\n| `a\\|b` |\n| x | y | excess |')
		expect(model.columns).toEqual([{ alignment: 'left' }, { alignment: 'right' }])
		expect(model.head[0].cells.map(cell => cell.markdown)).toEqual(['A', 'B'])
		expect(model.body.map(row => row.cells.map(cell => cell.markdown))).toEqual([['`a|b`', ''], ['x', 'y']])
		expect(model.body[0].cells[0]).toMatchObject({ contentType: 'inline', rowSpan: 1, columnSpan: 1 })
		expect(parsePipeTable('paragraph')).toBeNull()
	})

	it('accepts multiline block cells, spans, several header rows, foot and caption', () => {
		const cell = (markdown: string, rowSpan = 1, columnSpan = 1) => ({
			markdown, contentType: 'block' as const, rowSpan, columnSpan
		})
		const model: TableModel = {
			columns: [{ alignment: 'left' }, { alignment: 'center' }, { alignment: 'right' }],
			head: [
				{ cells: [cell('Location', 2), cell('Temperature\n\nin °C', 1, 2)] },
				{ cells: [cell('min'), cell('max')] }
			],
			body: [
				{ cells: [cell('Earth\n\n- inhabited\n- blue', 2), cell('cold'), cell('hot')] },
				{ cells: [cell('```\ncode\n```', 1, 2)] }
			],
			foot: [{ cells: [cell('Summary', 1, 3)] }],
			caption: { markdown: 'A **grid-shaped** model', contentType: 'inline' }
		}
		expect(JSON.parse(JSON.stringify(model))).toEqual(model)
		expect(model.head).toHaveLength(2)
		expect(model.body[0].cells[0].markdown.split('\n')).toHaveLength(4)
	})
})
