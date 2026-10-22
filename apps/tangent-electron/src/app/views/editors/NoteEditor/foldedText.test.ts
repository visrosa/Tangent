import TangentEmbed from './t-embed'
import { afterEach, describe, expect, it } from 'vitest'
import { deltaFromDom } from 'typewriter-editor'
import { wait } from '@such-n-such/core'
import { markdownToTextDocument } from 'common/markdownModel'
import MarkdownEditor from './MarkdownEditor'
import '../../../../../static/global.css'
import 'app/style/note.scss'

void TangentEmbed

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach(fn => fn()))

describe('ordinary section folding', () => {
	it.each([
		'# A long **heading** with `inline code` and enough text to overflow the available width\nbody',
		'- A long **parent** with `inline code` and enough text to overflow the available width\n  - child',
		'An introductory paragraph with enough text to overflow the available width\n- child',
		'> A quotation introducing nested content and enough text to overflow the available width\n> - child',
		'```js\nconst example = true\n```',
		'$$\nx + y\n$$',
		'---\ntitle: Example\n---'
	])('preserves ordinary collapse presentation and source for %s', async source => {
		const root = document.createElement('article')
		root.className = 'note'
		root.style.cssText = 'width:280px;white-space:pre-wrap;'
		document.body.append(root)
		const editor = new MarkdownEditor(null, { root, doc: markdownToTextDocument(source) })
		cleanup.push(() => { editor.destroy(); root.remove() })
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		const parent = root.querySelector('.collapse-parent')
		expect(parent).not.toBeNull()
		expect(root.querySelector('.folded-text')).toBeNull()
		expect(getComputedStyle(parent).maskImage).toBe('none')
		expect(getComputedStyle(parent, '::after').content).toBe(source.startsWith('---')
			? '"--- front matter ---"' : '"…"')
		if (source.startsWith('- ')) expect(root.querySelector('p.list > .line_format')).not.toBeNull()
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		expect(editor.getText()).toBe(source)
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(root.querySelector('.folded-text')).toBeNull()
	})
})
