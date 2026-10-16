import { describe, it, expect } from 'vitest'
import type { TreeNode } from 'common/trees'
import IndexTreeStore from 'common/indexing/IndexTreeStore'
import DirectoryView from './directoryView'

function fixture() {
	const note: TreeNode = { name: 'Note', path: '/vault/A/Note.md', fileType: '.md' }
	const inner: TreeNode = { name: 'Inner', path: '/vault/A/Inner', fileType: 'folder', children: [] }
	const a: TreeNode = { name: 'A', path: '/vault/A', fileType: 'folder', children: [note, inner] }
	const b: TreeNode = { name: 'B', path: '/vault/B', fileType: 'folder', children: [] }
	const hidden: TreeNode = { name: '.hidden', path: '/vault/.hidden', fileType: 'folder', children: [
		{ name: 'Inside', path: '/vault/.hidden/Inside', fileType: 'folder', children: [] }
	] }
	const virtual: TreeNode = { name: 'Virtual', path: '/vault/Virtual', fileType: 'folder', children: [], meta: { uuid: 'virtual', virtual: true } }
	const root: TreeNode = { name: 'Vault', path: '/vault', fileType: 'folder', children: [a, b, hidden, virtual] }
	const store = new IndexTreeStore({ files: root, tags: { name: '', path: '', fileType: 'tag', names: [], children: [] } })
	const view = new DirectoryView(store, root)
	view.setupObservables()
	return { view, store, root, a, b, inner, note, hidden, virtual }
}

describe('Sidebar folder expansion', () => {
	it('collapses a mixed root level and restores descendants on expansion', () => {
		const { view, a, b, inner } = fixture()
		view.openDirectories.set(new Set([a, inner]))
		view.toggleFolders('level')
		expect(Array.from(view.visibleItems)).toEqual([a, b])
		expect(view.openDirectories.value).toEqual(new Set([inner]))
		view.toggleFolders('level')
		expect(view.openDirectories.value).toEqual(new Set([a, b, inner]))
	})

	it('targets siblings of a focused row, with file selection as fallback', () => {
		const { view, a, b, inner, note } = fixture()
		view.openDirectories.add(a)
		view.selection.set([note])
		expect(view.getFolderToggleState('level').folders).toEqual([inner])
		expect(new Set(view.getFolderToggleState('level', a).folders)).toEqual(new Set([a, b]))
		view.toggleFolders('level', note)
		expect(view.isItemOpen(inner)).toBe(true)
		expect(view.selection.value).toEqual([note])
		view.toggleFolders('level', note)
		expect(view.isItemOpen(a)).toBe(true)
		expect(view.isItemOpen(inner)).toBe(false)
	})

	it('recurses into closed folders while preserving excluded branches and root state', () => {
		const { view, root, a, b, inner, hidden, virtual } = fixture()
		view.openDirectories.set(new Set([root, hidden, virtual]))
		view.toggleFolders('all')
		expect(view.openDirectories.value).toEqual(new Set([root, hidden, virtual, a, b, inner]))
		view.toggleFolders('all')
		expect(view.openDirectories.value).toEqual(new Set([root, hidden, virtual]))
	})

	it('resolves hidden anchors through visible ancestors and ignores removed or foreign rows', () => {
		const { view, store, root, a, b, inner, note } = fixture()
		view.selection.set([note])
		expect(view.getFolderToggleState('level', inner).parent).toBe(root)
		view.openDirectories.add(a)
		store.remove(inner)
		expect(view.getFolderToggleState('level', inner).parent).toBe(a)
		expect(view.getFolderToggleState('level', { ...b, path: '/elsewhere/B' }).parent).toBe(a)
		view.selection.set([])
		expect(view.getFolderToggleState('level', inner).parent).toBe(root)
	})

	it('publishes one portable patch that restores recursive expansion', () => {
		const { view, store, root } = fixture()
		const patches: unknown[] = []
		view.observePatch(patch => patches.push(patch))
		view.toggleFolders('all')
		expect(patches).toHaveLength(1)
		const restored = new DirectoryView(store, root)
		restored.applyPatch(patches[0])
		expect(Array.from(restored.visibleItems)).toEqual(Array.from(view.visibleItems))
		expect(restored.openDirectories.value).toEqual(view.openDirectories.value)
	})

	it('handles live additions and no-folder scopes without a patch', () => {
		const { view, store, a, inner, note } = fixture()
		view.openDirectories.add(a)
		store.remove(inner)
		const patches: unknown[] = []
		view.observePatch(patch => patches.push(patch))
		view.toggleFolders('level', note)
		expect(patches).toHaveLength(0)
		const added: TreeNode = { name: 'New', path: '/vault/A/New', fileType: 'folder', children: [] }
		store.add(added)
		view.toggleFolders('level', note)
		expect(view.isItemOpen(added)).toBe(true)
		expect(patches).toHaveLength(1)
	})
})
