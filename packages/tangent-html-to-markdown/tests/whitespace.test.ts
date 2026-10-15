import { describe, expect, it } from 'vitest'
import htmlToMarkdown from '../src/index'

describe('HTML clipboard whitespace', () => {
	it.each(['&nbsp;', '&#160;', '&#xA0;', '\u00a0'])('normalizes decoded NBSP %s', space => {
		expect(htmlToMarkdown(`<p>one${space}two <strong>three${space}four</strong></p>`)).toBe('one two **three four**')
		expect(htmlToMarkdown(`<p><a href="https://example.org/">one${space}two</a></p>`)).toBe('[one two](https://example.org/)')
		expect(htmlToMarkdown(`<pre><code>one${space}two</code></pre>`)).not.toContain('\u00a0')
		expect(htmlToMarkdown(`<p><code>one${space}two</code></p>`)).not.toContain('\u00a0')
	})
	it('preserves other Unicode spaces', () => {
		expect(htmlToMarkdown('<p>a\u202fb\u2009c</p>')).toBe('a\u202fb\u2009c')
	})
})
