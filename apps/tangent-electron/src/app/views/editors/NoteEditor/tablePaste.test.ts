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
		expect(reopened.lines.map(line => line.attributes.table.rowType)).toEqual(['data', 'separator', 'data'])
		expect(matchTableRow(reopened.lines[2].attributes.table.rawContent)).toEqual(['a\\|b', ''])
	})

	it('preserves a headerless spreadsheet table and literal inline formatting', () => {
		const markdown = htmlToMarkdown('<table><tr><td><strong>A</strong></td><td>B</td></tr><tr><td></td><td></td></tr></table>')
		expect(markdown).toBe('| **A** | B |\n|  |  |')
		const doc = markdownToTextDocument(typewriterToText(markdownToTextDocument(markdown)))
		expect(typewriterToText(doc)).toBe(markdown)
		expect(doc.lines.every(line => line.attributes.table.rowType === 'data')).toBe(true)
	})
})
