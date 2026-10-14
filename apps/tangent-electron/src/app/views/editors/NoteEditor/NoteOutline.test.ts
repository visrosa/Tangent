import { afterEach, describe, expect, it } from 'vitest'
import { mount, unmount } from 'svelte'
import TangentEmbed from './t-embed'
import MarkdownEditor from './MarkdownEditor'
import NoteOutline from './NoteOutline.svelte'
import NoteViewInfo from 'common/dataTypes/NoteViewInfo'
import { markdownToTextDocument } from 'common/markdownModel'
import { getOutlineHeadings } from './outline'
import { wait } from '@such-n-such/core'
import 'app/style/note.scss'
import '../../../../../static/global.css'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

function setup(source: string, width = 800) {
	void TangentEmbed
	const container = document.createElement('main')
	container.style.cssText = `width:${width}px;height:300px;overflow:auto;box-sizing:border-box;position:relative;`
	const root = document.createElement('article')
	root.className = 'note'
	root.style.whiteSpace = 'pre-wrap'
	container.append(root)
	document.body.append(container)
	const editor = new MarkdownEditor(null)
	editor.setRoot(root)
	editor.set(markdownToTextDocument(source))
	const info = new NoteViewInfo({ json: {} })
	const component = mount(NoteOutline, {
		target: container, anchor: root,
		props: {
			editor, container, info,
			onWidth: width => { container.style.setProperty('--outlineWidth', width + 'px'); container.style.paddingLeft = width + 'px' },
			onNavigate: position => editor.select(position)
		}
	})
	cleanups.push(async () => { await unmount(component); editor.destroy(); container.remove() })
	return { container, editor, info }
}

describe('note outline', () => {
	it('uses live headings, readable labels, hierarchy and distinct duplicate positions', async () => {
		const source = '# **First**\n### Child\n# First\n```md\n# Inert\n```\n[^a]: note\n    # Footnote'
		const { editor } = setup(source)
		await wait(30)
		const headings = getOutlineHeadings(editor.doc)
		expect(headings.map(heading => [heading.text, heading.depth])).toEqual([['First', 0], ['Child', 1], ['First', 0]])
		expect(headings[2].start).toBe(source.indexOf('# First'))
		editor.change.insert(0, '# New\n').apply()
		await wait(30)
		expect(getOutlineHeadings(editor.doc)[0].text).toBe('New')
	})
	it('reserves space before the gutter and stays attached while the note scrolls', async () => {
		const { container } = setup('# Title\n' + 'body\n'.repeat(80))
		await wait(40)
		const nav = container.querySelector('nav')
		const line = container.querySelector('.line')
		const initial = nav.getBoundingClientRect()
		expect(initial.width).toBe(192)
		expect(line.getBoundingClientRect().left - initial.right).toBeGreaterThan(20)
		container.scrollTop = 300
		await wait(40)
		expect(nav.getBoundingClientRect().top).toBeCloseTo(initial.top, 0)
	})
	it('folds on narrow panels, opens on demand and preserves the saved preference', async () => {
		const { container, info } = setup('# Title', 500)
		await wait(40)
		const nav = container.querySelector('nav')
		expect(nav.getBoundingClientRect().width).toBe(28)
		expect(info.outlineExpanded.value).toBe(true)
		container.querySelector<HTMLButtonElement>('.toggle').click()
		await wait(30)
		expect(nav.classList.contains('overlay')).toBe(true)
		expect(container.style.paddingLeft).toBe('28px')
		container.style.width = '800px'
		await wait(40)
		expect(nav.getBoundingClientRect().width).toBe(192)
	})
	it('navigates to a folded duplicate heading without changing source', async () => {
		const source = '# Parent\n## Child\ntext\n# Parent'
		const { container, editor, info } = setup(source)
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait(40)
		container.querySelector<HTMLButtonElement>('.headings button:nth-child(2)').click()
		await wait(30)
		expect(editor.doc.selection[0]).toBe(source.indexOf('## Child'))
		expect(container.querySelectorAll('.line')[1].getBoundingClientRect().height).toBeGreaterThan(0)
		expect(editor.getText()).toBe(source)
		container.querySelector<HTMLButtonElement>('.toggle').click()
		await wait(20)
		expect(info.outlineExpanded.value).toBe(false)
		const restored = new NoteViewInfo({ json: info.getRawValues('file') })
		expect(restored.outlineExpanded.value).toBe(false)
	})
})
