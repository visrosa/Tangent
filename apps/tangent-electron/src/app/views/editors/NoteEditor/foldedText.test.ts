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

describe('folded text', () => {
	it.each([
		'# A long **heading** with `inline code` and enough text to overflow the available width\nbody',
		'- A long **parent** with `inline code` and enough text to overflow the available width\n  - child',
		'An introductory paragraph with enough text to overflow the available width\n- child',
		'> A quotation introducing nested content and enough text to overflow the available width\n> - child',
		'```js\nconst example = true\n```',
		'$$\nx + y\n$$',
		'---\ntitle: Example\n---'
	])('preserves source and offsets while fading a folded %s', async source => {
		const root = document.createElement('article')
		root.className = 'note'
		root.style.cssText = 'width:280px;white-space:pre-wrap;'
		document.body.append(root)
		const editor = new MarkdownEditor(null, { root, doc: markdownToTextDocument(source) })
		cleanup.push(() => { editor.destroy(); root.remove() })
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		const folded = root.querySelector('.collapse-parent .folded-text')
		expect(folded).not.toBeNull()
		const content = folded.querySelector('.folded-text-content')
		expect(getComputedStyle(content).maskImage).toContain('linear-gradient')
		expect(getComputedStyle(folded.querySelector('.folded-text-marker'), '::after').content).toBe('"⋯"')
		expect(folded.querySelector('.folded-text-marker').getBoundingClientRect().width).toBeGreaterThan(0)
		expect(folded.getBoundingClientRect().height).toBeGreaterThan(0)
		expect(folded.getBoundingClientRect().width).toBeLessThanOrEqual(root.clientWidth)
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		expect(editor.getText()).toBe(source)
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(root.querySelector('.folded-text')).toBeNull()
	})
})
