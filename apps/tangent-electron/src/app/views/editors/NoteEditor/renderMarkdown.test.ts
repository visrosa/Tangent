import { describe, expect, it } from 'vitest'
import './t-embed'
import { renderMarkdown } from './renderMarkdown'

describe('Markdown preview rendering', () => {
	it('uses the note formats for inline fragments without recognizing block syntax', () => {
		const target = document.createElement('div')
		renderMarkdown(target, '# **bold** _italic_ `code` [[note]] $x$ {字|じ}', 'inline')
		expect(target.querySelector('strong:not(.hidden)').textContent).toBe('bold')
		expect(target.querySelector('em:not(.hidden)').textContent).toBe('italic')
		expect(target.querySelector('code:not(.hidden)').textContent).toBe('code')
		expect(target.querySelector('t-link').getAttribute('href')).toBe('note')
		expect(target.querySelector('t-math').getAttribute('math-source')).toBe('x')
		expect(target.querySelector('t-furigana').shadowRoot.querySelector('ruby').textContent).toBe('字じ')
		expect(target.querySelector('h1')).toBeNull()
		expect(target.textContent.startsWith('# ')).toBe(true)
	})

	it('uses block parsing for multiline Markdown and replaces previous content', () => {
		const target = document.createElement('div')
		renderMarkdown(target, 'Paragraph\n\n- first\n- **second**\n\n```\ncode\n```')
		expect(target.querySelectorAll('p.list')).toHaveLength(2)
		expect(target.querySelector('pre code').textContent).toContain('code')
		renderMarkdown(target, 'replacement', 'inline')
		expect(target.textContent).toBe('replacement')
		expect(target.querySelector('pre')).toBeNull()
	})
})
