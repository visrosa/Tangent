import { afterEach, describe, expect, it } from 'vitest'
import { mount, unmount } from 'svelte'
import TangentEmbed from './t-embed'
import MarkdownEditor from './MarkdownEditor'
import NoteOutline from './NoteOutline.svelte'
import ThreadViewVerticalTitleBar from '../../Tangent/ThreadViewVerticalTitleBar.svelte'
import { WritableStore } from 'common/stores'
import type { NoteOutlineControl } from './outline'
import NoteViewInfo from 'common/dataTypes/NoteViewInfo'
import { markdownToTextDocument } from 'common/markdownModel'
import { getOutlineHeadings } from './outline'
import { wait } from '@such-n-such/core'
import 'app/style/note.scss'
import 'app/style/input.scss'
import '../../../../../static/global.css'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

function setup(source: string, width = 800, titleSidebar = false) {
	void TangentEmbed
	const container = document.createElement('main')
	container.style.cssText = `width:${width}px;height:300px;overflow:auto;box-sizing:border-box;position:relative;`
	const root = document.createElement('article')
	root.className = 'note'
	root.style.whiteSpace = 'pre-wrap'
	container.append(root)
	const thread = document.createElement('div')
	thread.className = 'ThreadView' + (titleSidebar ? ' multiple' : '')
	thread.style.cssText = 'position:relative;height:300px;'
	thread.append(container)
	document.body.append(thread)
	const control = new WritableStore<NoteOutlineControl>(null)
	const title = titleSidebar ? mount(ThreadViewVerticalTitleBar, {
		target: thread,
		context: new Map([['workspace', { commands: {} }]]),
		props: { node: { name: 'Example note', path: '/Example.md' }, tangent: null, outlineControl: control }
	}) : null
	const editor = new MarkdownEditor(null)
	editor.setRoot(root)
	editor.set(markdownToTextDocument(source))
	const info = new NoteViewInfo({ json: {} })
	const component = mount(NoteOutline, {
		target: container, anchor: root,
		props: {
			editor, container, info,
			onControl: value => control.set(value),
			onWidth: width => { container.style.setProperty('--outlineWidth', width + 'px'); container.style.paddingLeft = width + 'px' },
			onNavigate: position => editor.select(position)
		}
	})
	cleanups.push(async () => { await unmount(component); if (title) await unmount(title); editor.destroy(); thread.remove() })
	return { container, editor, info, thread, control }
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
	it('places the shared outline toggle below close and before the side controls and title', async () => {
		const { container, thread, info } = setup('# Title\n## Child', 800, true)
		await wait(40)
		const buttons = Array.from(thread.querySelectorAll<HTMLButtonElement>('.verticalTitleBar button'))
		expect(buttons).toHaveLength(4)
		expect(buttons[0].classList.contains('close')).toBe(true)
		expect(buttons[1].classList.contains('outline')).toBe(true)
		expect(buttons[2].getAttribute('aria-label')).toBe('Close files to the left')
		expect(buttons[3].getAttribute('aria-label')).toBe('Close files to the right')
		expect(thread.querySelector('.verticalTitleBar .name').previousElementSibling.classList.contains('buttons')).toBe(true)
		expect(buttons[1].getBoundingClientRect().top).toBeGreaterThan(buttons[0].getBoundingClientRect().top)
		expect(buttons[2].getBoundingClientRect().top).toBeGreaterThan(buttons[1].getBoundingClientRect().top)
		expect(container.querySelector('.toggle')).toBeNull()
		buttons[1].click()
		await wait(30)
		expect(info.outlineExpanded.value).toBe(false)
		expect(buttons[1].getAttribute('aria-expanded')).toBe('false')
		expect(container.style.paddingLeft).toBe('0px')
		expect(getComputedStyle(container.querySelector('nav')).display).toBe('none')
		thread.classList.remove('multiple')
		await wait(40)
		expect(container.querySelector('.toggle')).not.toBeNull()
		expect(container.style.paddingLeft).toBe('28px')
		thread.classList.add('multiple')
		await wait(40)
		expect(container.querySelector('.toggle')).toBeNull()
		expect(container.style.paddingLeft).toBe('0px')
	})

	it('opens narrow outlines from the title bar and releases the per-view controller on unmount', async () => {
		const { container, thread, info, control } = setup('# Title', 500, true)
		await wait(40)
		const button = thread.querySelector<HTMLButtonElement>('.verticalTitleBar .outline')
		expect(button.getAttribute('aria-expanded')).toBe('false')
		expect(container.style.paddingLeft).toBe('0px')
		button.click()
		await wait(30)
		expect(container.querySelector('nav').classList.contains('overlay')).toBe(true)
		expect(button.getAttribute('aria-expanded')).toBe('true')
		expect(info.outlineExpanded.value).toBe(true)
		container.querySelector<HTMLButtonElement>('.headings button').click()
		await wait(30)
		expect(button.getAttribute('aria-expanded')).toBe('false')
		await cleanups.pop()()
		expect(control.value).toBeNull()
	})

})
