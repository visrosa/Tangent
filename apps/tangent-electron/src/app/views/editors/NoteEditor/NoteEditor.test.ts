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
import 'app/style/note.scss'
import '../../../../../static/global.css'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup(source: string, panel = false) {
	const workspace = {
		settings: new Settings(),
		viewState: { focusing: new WritableStore(false) },
		api: { file: {} },
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
	}
	const target = document.createElement('div')
	target.style.cssText = 'width:900px;height:400px;position:relative;'
	document.body.append(target)
	const component = mount(NoteEditor, {
		target, context: new Map([['workspace', workspace]]),
		props: { state, editable: false, allowOverscroll: false, fixedTitle: false }
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
