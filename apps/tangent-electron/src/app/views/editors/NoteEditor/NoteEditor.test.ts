import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import NoteEditor from './NoteEditor.svelte'
import NoteFile from 'app/model/NoteFile'
import Settings from 'common/settings/Settings'
import { WritableStore } from 'common/stores'
import { markdownToTextDocument } from 'common/markdownModel'
import type Workspace from 'app/model/Workspace'
import type NoteViewState from 'app/model/nodeViewStates/NoteViewState'
import type { NoteOutlineControl } from './outline'
import NoteViewInfo from 'common/dataTypes/NoteViewInfo'
import { FocusLevel } from 'common/dataTypes/TangentInfo'
import { wait } from '@such-n-such/core'
import 'app/style/note.scss'
import '../../../../../static/global.css'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup(source: string, panel = false, options: Record<string, unknown> = {}) {
	const workspace = {
		settings: new Settings(),
		viewState: { focusing: new WritableStore(false) },
		api: { file: {} },
		dispatchEvent: vi.fn(),
		directoryStore: { files: { name: 'Vault', path: '/', fileType: 'folder', children: [] } }
	} as unknown as Workspace
	const note = new NoteFile({ name: 'Example', path: '/Example.md', fileType: '.md', depth: 1 }, workspace)
	note.loadState = 'loaded'
	note._lines = markdownToTextDocument(source).lines
	note.loadFile = vi.fn()
	note.dropFile = vi.fn()
	const state: Pick<NoteViewState, 'note'> & Partial<NoteViewState> = { note }
	if (panel) {
		state.outlineControl = new WritableStore<NoteOutlineControl>(null)
		state.noteViewInfo = new WritableStore(new NoteViewInfo({ json: {} }))
		state.selection = new WritableStore(null)
		state.scrollY = new WritableStore(0)
		state.editor = null
	}
	const target = document.createElement('div')
	target.style.cssText = 'width:900px;height:400px;position:relative;'
	document.body.append(target)
	const component = mount(NoteEditor, {
		target, context: new Map([['workspace', workspace]]),
		props: { state, editable: false, allowOverscroll: false, fixedTitle: false, ...options }
	})
	cleanups.push(async () => { await unmount(component); target.remove() })
	await tick()
	return { target, state, note, component }
}
describe('note panel and preview ownership', () => {
	it('mounts, updates and tears down lightweight fill previews without an outline or reserved gutter', async () => {
		const { target, note } = await setup('# Preview\nBody')
		expect(target.querySelector('article').textContent).toContain('Preview')
		expect(target.querySelector('nav')).toBeNull()
		expect(target.querySelector<HTMLElement>('.noteEditor').style.getPropertyValue('--outlineWidth')).toBe('0px')
		note._lines = markdownToTextDocument('# Other preview\nChanged').lines
		note.notifyChanged()
		await tick()
		expect(target.querySelector('article').textContent).toContain('Other preview')
		await cleanups.pop()()
		expect(note.dropFile).toHaveBeenCalledTimes(1)
	})
	it('keeps full-panel outline controls and releases the controller on teardown', async () => {
		const { target, state } = await setup('# Note\n## Child', true)
		await vi.waitFor(() => expect(target.querySelector('nav')).not.toBeNull())
		expect(state.outlineControl.value).not.toBeNull()
		await cleanups.pop()()
		expect(state.outlineControl.value).toBeNull()
	})
})


describe('explicit outline navigation', () => {
	it.each([FocusLevel.Thread, FocusLevel.File, FocusLevel.Typewriter, FocusLevel.Paragraph, FocusLevel.Line, FocusLevel.Sentence])('places target and following content near the top in focus mode %i', async focusLevel => {
		const source = '# Start\n' + 'Body line\n'.repeat(40) + '## Destination\nFollowing content\n' + 'More text\n'.repeat(40)
		const { target, state } = await setup(source, true, { editable: true, focusLevel })
		await wait(80)
		const container = target.querySelector<HTMLElement>('.noteEditor')
		const destination = () => Array.from(target.querySelectorAll<HTMLElement>('article .line')).find(line => line.textContent.includes('Destination'))
		const button = Array.from(target.querySelectorAll<HTMLButtonElement>('.headings button')).find(button => button.textContent === 'Destination')
		for (const initialScroll of [0, 1000]) {
			container.scrollTop = initialScroll
			button.click()
			await wait(80)
			const offset = destination().getBoundingClientRect().top - container.getBoundingClientRect().top
			expect(offset).toBeGreaterThanOrEqual(20)
			expect(offset).toBeLessThan(60)
			expect(state.editor.getText()).toBe(source)
			expect(state.editor.doc.selection).toEqual([source.indexOf('## Destination'), source.indexOf('## Destination')])
		}
	})
	it('unfolds destinations, accounts for top chrome and fixed title, and clamps at the document end', async () => {
		const source = '# Parent\n' + 'Body\n'.repeat(30) + '## Hidden child\nFollowing content\n' + 'Body\n'.repeat(30) + '# Last'
		const { target, state } = await setup(source, true, { editable: true, extraTop: 30, fixedTitle: true })
		await wait(80)
		state.editor.collapsingSections.toggleLineCollapsed(0)
		await tick()
		const container = target.querySelector<HTMLElement>('.noteEditor')
		const buttons = Array.from(target.querySelectorAll<HTMLButtonElement>('.headings button'))
		buttons.find(button => button.textContent === 'Hidden child').click()
		await wait(80)
		const line = Array.from(target.querySelectorAll<HTMLElement>('article .line')).find(line => line.textContent.includes('Hidden child'))
		expect(line.getBoundingClientRect().height).toBeGreaterThan(0)
		expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(target.querySelector('header').getBoundingClientRect().bottom + 20)
		buttons.find(button => button.textContent === 'Last').click()
		await wait(80)
		expect(container.scrollTop).toBeCloseTo(container.scrollHeight - container.clientHeight, 0)
		expect(state.editor.getText()).toBe(source)
	})
})

it('opens nested destination ancestors and its own section while preserving unrelated folds', async () => {
	const source = '# Sibling\nHidden sibling\n# Parent\n## Nested\n### Destination\nRead this content\n## Other\nUnrelated content'
	const { target, state } = await setup(source, true, { editable: true })
	await wait(80)
	for (const index of [0, 4, 3, 6, 2]) state.editor.collapsingSections.toggleLineCollapsed(index)
	await tick()
	Array.from(target.querySelectorAll<HTMLButtonElement>('.headings button')).find(button => button.textContent === 'Destination').click()
	await wait(80)
	expect(state.editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(true)
	expect(state.editor.collapsingSections.lineHasCollapsedChildren(6)).toBe(true)
	for (const index of [2, 3, 4]) expect(state.editor.collapsingSections.lineHasCollapsedChildren(index)).toBe(false)
	expect(state.editor.collapsingSections.lineIsCollapsed(5)).toBe(false)
	expect(state.editor.getText()).toBe(source)
})
