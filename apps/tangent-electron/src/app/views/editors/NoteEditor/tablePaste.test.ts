import { describe, expect, it } from 'vitest'
import htmlToMarkdown from '@such-n-such/tangent-html-to-markdown'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import { typewriterToText } from 'common/typewriterUtils'
import { matchTableRow } from 'common/markdownModel/table'

describe('HTML table paste and reopen', () => {
	it('preserves header, empty cells, and escaped pipes through note serialization', () => {
		const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>a|b</td><td></td></tr></tbody></table>'
		const markdown = htmlToMarkdown(html)
		expect(markdown).toBe('| A | B |\n| --- | --- |\n| a\\|b |  |')
		const pasted = markdownToTextDocument(markdown)
		const saved = typewriterToText(pasted)
		const reopened = markdownToTextDocument(saved)
		expect(typewriterToText(reopened)).toBe(markdown)
		expect(reopened.lines[0].attributes.table.model.head).toHaveLength(1)
		expect(reopened.lines[0].attributes.table.model.body[0].cells.map(cell => cell.markdown)).toEqual(['a|b', ''])
		expect(matchTableRow(reopened.lines[2].attributes.table.source.split('\n')[2])).toEqual(['a\\|b', ''])
	})

	it('preserves a headerless spreadsheet table and literal inline formatting', () => {
		const markdown = htmlToMarkdown('<table><tr><td><strong>A</strong></td><td>B</td></tr><tr><td></td><td></td></tr></table>')
		expect(markdown).toBe('| **A** | B |\n|  |  |')
		const doc = markdownToTextDocument(typewriterToText(markdownToTextDocument(markdown)))
		expect(typewriterToText(doc)).toBe(markdown)
		expect(doc.lines[0].attributes.table.model.head).toHaveLength(0)
	})

	it('reopens a pasted grid with its row span intact', () => {
		const markdown = htmlToMarkdown('<table><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>')
		expect(markdown).toBe('+---+---+\n| A | B |\n|   +---+\n|   | C |\n+---+---+')
		const reopened = markdownToTextDocument(typewriterToText(markdownToTextDocument(markdown)))
		expect(reopened.lines[0].attributes.table.model.body.map(row => row.cells.map(cell => cell.markdown)))
			.toEqual([['A', 'B'], ['C']])
		expect(reopened.lines[0].attributes.table.model.body[0].cells[0].rowSpan).toBe(2)
	})

	it('reopens block Markdown, alignment, spanning headers, foot and caption', () => {
		const html = '<table><caption>A <strong>caption</strong></caption><thead><tr><th colspan="2">Range</th></tr></thead><tbody><tr><td style="text-align: right"><p>first</p><ul><li>one</li><li>two</li></ul></td><td><pre>code</pre></td></tr></tbody><tfoot><tr><td colspan="2">Total</td></tr></tfoot></table>'
		const markdown = htmlToMarkdown(html)
		const reopened = markdownToTextDocument(typewriterToText(markdownToTextDocument(markdown)))
		const model = reopened.lines[0].attributes.table.model
		expect(typewriterToText(reopened)).toBe(markdown)
		expect(model.head[0].cells[0].columnSpan).toBe(2)
		expect(model.body[0].cells[0].markdown).toBe('first\n\n* one\n* two')
		expect(model.body[0].cells[1].markdown).toContain('code')
		expect(model.columns[0].alignment).toBe('right')
		expect(model.foot[0].cells[0].columnSpan).toBe(2)
		expect(model.caption.markdown).toBe('A **caption**')
	})

	it('retains body and foot roles in a complex HTML table without a header', () => {
		const markdown = htmlToMarkdown('<table><tbody><tr><td><p>body</p></td></tr></tbody><tfoot><tr><td>foot</td></tr></tfoot></table>')
		const model = markdownToTextDocument(markdown).lines[0].attributes.table.model
		expect(model.head).toHaveLength(0)
		expect(model.body[0].cells[0].markdown).toBe('body')
		expect(model.foot[0].cells[0].markdown).toBe('foot')
	})

	it('preserves an HTML row entirely covered by continuing spans', () => {
		const markdown = htmlToMarkdown('<table><tr><td rowspan="2">A</td><td rowspan="2">B</td></tr><tr></tr></table>')
		const model = markdownToTextDocument(markdown).lines[0].attributes.table.model
		expect(model.body).toHaveLength(2)
		expect(model.body[0].cells.map(cell => cell.rowSpan)).toEqual([2, 2])
		expect(model.body[1].cells).toHaveLength(0)
	})
})
