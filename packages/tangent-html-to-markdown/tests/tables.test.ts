import { describe, expect, it } from 'vitest'
import htmlToMarkdown from '../src'

describe('Pipe tables', () => {
	it('converts header and body rows', () => {
		expect(htmlToMarkdown('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'))
			.toBe('| A | B |\n| --- | --- |\n| a | b |')
	})

	it('retains data-only tables without a thead', () => {
		expect(htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td>a</td><td>b</td></tr></table>'))
			.toBe('| A | B |\n| a | b |')
	})

	it('escapes pipes while preserving inline formatting', () => {
		expect(htmlToMarkdown('<table><tr><td><strong>A|B</strong></td><td><a href="https://example.com">link</a></td><td><em>italic</em></td></tr></table>'))
			.toBe('| **A\\|B** | [link](https://example.com) | _italic_ |')
	})

	it('keeps empty cells and entirely empty rows', () => {
		expect(htmlToMarkdown('<table><tr><td></td><td></td></tr><tr><td>a</td><td></td></tr></table>'))
			.toBe('|  |  |\n| a |  |')
		expect(htmlToMarkdown('<table><tr><td></td><td></td></tr></table>')).toBe('|  |  |')
	})

	it('puts one separator after all thead rows', () => {
		expect(htmlToMarkdown('<table><thead><tr><th>A</th></tr><tr><th>B</th></tr></thead><tbody><tr><td>C</td></tr></tbody></table>'))
			.toBe('| A |\n| B |\n| --- |\n| C |')
	})

	it('separates tables from neighboring paragraphs and tables', () => {
		expect(htmlToMarkdown('<p>before</p><table><tr><td>A</td></tr></table><table><tr><td>B</td></tr></table><p>after</p>'))
			.toBe('before\n\n| A |\n\n| B |\n\nafter')
	})

	it('keeps multiline cell content within one pipe row', () => {
		expect(htmlToMarkdown('<table><tr><td><p>A</p><p>B</p></td><td>C</td></tr></table>'))
			.toBe('| A  B | C |')
	})
})
