import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { mount, tick, unmount } from 'svelte'
import type { Workspace } from 'app/model'
import DirectoryView from 'app/model/directoryView'
import Command from 'app/model/commands/Command'
import IndexTreeStore from 'common/indexing/IndexTreeStore'
import SidebarState from 'common/SidebarState'
import { WritableStore } from 'common/stores'
import type { TreeNode } from 'common/trees'
import LeftSidebar from '../LeftSidebar.svelte'
import 'app/style/input.scss'
import '../../../../static/global.css'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

class TestCommand extends Command {
	execute = vi.fn()
	getLabel() { return 'Create New Folder' }
}

async function setup(width = 300) {
	const note: TreeNode = { name: 'Note', path: '/vault/A/Note.md', fileType: '.md', depth: 2 }
	const inner: TreeNode = { name: 'Inner', path: '/vault/A/Inner', fileType: 'folder', children: [], depth: 2 }
	const a: TreeNode = { name: 'A', path: '/vault/A', fileType: 'folder', children: [note, inner], depth: 1 }
	const b: TreeNode = { name: 'B', path: '/vault/B', fileType: 'folder', children: [], depth: 1 }
	const root: TreeNode = { name: 'Vault', path: '/vault', fileType: 'folder', children: [a, b], depth: 0 }
	const directoryStore = new IndexTreeStore({ files: root, tags: { name: '', path: '', fileType: 'tag', names: [], children: [] } })
	const view = new DirectoryView(directoryStore, root)
	view.setupObservables()
	const leftSidebar = new SidebarState()
	leftSidebar.size.set(width)
	const createNewFolder = new TestCommand()
	const workspace = {
		directoryStore,
		viewState: {
			leftSidebar, directoryView: view,
			tagTreeView: new DirectoryView(directoryStore, directoryStore.tags),
			tangent: { currentNode: new WritableStore(null), thread: new WritableStore([]) }
		},
		commands: { createNewFolder, moveToRightFile: new TestCommand() },
		navigateTo: vi.fn()
	} as unknown as Workspace
	const container = document.createElement('main')
	document.body.append(container)
	const component = mount(LeftSidebar, {
		target: container,
		context: new Map([['workspace', workspace]]),
		props: { visible: true, hoveringOver: false, hasFocus: false }
	})
	cleanups.push(async () => { await unmount(component); container.remove() })
	await tick()
	return {
		container, view, leftSidebar, directoryStore, a, b, inner, note, createNewFolder,
		buttons: () => Array.from(container.querySelectorAll<HTMLButtonElement>('header > .buttonBar:not(.tabs) button')),
		row: (name: string) => Array.from(container.querySelectorAll<HTMLElement>('.FileTreeItem')).find(row => row.textContent.trim() === name)
	}
}

describe('Sidebar folder toolbar', () => {
	it('fits both controls between sorting and new-folder at normal and minimum width', async () => {
		const { container, buttons, leftSidebar } = await setup()
		for (const width of [300, 150]) {
			leftSidebar.size.set(width)
			await tick()
			const controls = buttons()
			expect(controls).toHaveLength(4)
			expect(controls[1].getAttribute('aria-label')).toBe('Expand folders at current level (Vault)')
			expect(controls[2].getAttribute('aria-label')).toBe('Expand all folders')
			const bounds = container.querySelector('.sidebar').getBoundingClientRect()
			for (let i = 0; i < controls.length; i++) {
				const rect = controls[i].getBoundingClientRect()
				expect(rect.width).toBeGreaterThanOrEqual(24)
				expect(rect.left).toBeGreaterThanOrEqual(bounds.left)
				expect(rect.right).toBeLessThanOrEqual(bounds.right)
				if (i) expect(rect.left).toBeGreaterThanOrEqual(controls[i - 1].getBoundingClientRect().right)
			}
		}
	})

	it('keeps focused row context in the toolbar and updates labels and tree after each click', async () => {
		const { view, buttons, row, a, inner, note } = await setup()
		view.toggleOpen(a)
		await tick()
		row('Note').focus()
		await tick()
		const level = buttons()[1]
		expect(level.title).toBe('Expand folders at current level (A)')
		level.focus()
		level.click()
		await tick()
		expect(view.isItemOpen(inner)).toBe(true)
		expect(view.isItemOpen(a)).toBe(true)
		expect(level.title).toBe('Collapse folders at current level (A)')
		level.click()
		await tick()
		expect(view.isItemOpen(inner)).toBe(false)
		expect(row('Note')).toBeDefined()
		view.selection.set([note])
		buttons()[2].click()
		await tick()
		expect(row('Note')).toBeUndefined()
		expect(view.selection.value).toEqual([note])
		expect(level.title).toBe('Expand folders at current level (Vault)')
	})

	it('supports native Tab, Enter and Space without changing tabs or invoking new-folder', async () => {
		const { buttons, leftSidebar, view, a, b, createNewFolder } = await setup()
		buttons()[0].focus()
		await userEvent.keyboard('{Tab}')
		expect(document.activeElement).toBe(buttons()[1])
		await userEvent.keyboard('{Enter}')
		await tick()
		expect(view.isItemOpen(a)).toBe(true)
		expect(view.isItemOpen(b)).toBe(true)
		await userEvent.keyboard('{Tab}')
		expect(document.activeElement).toBe(buttons()[2])
		await userEvent.keyboard(' ')
		await tick()
		expect(view.isItemOpen(a)).toBe(false)
		await userEvent.keyboard('{Tab}')
		expect(document.activeElement).toBe(buttons()[3])
		expect(leftSidebar.currentTab.value).toBe('files')
		expect(createNewFolder.execute).not.toHaveBeenCalled()
	})

	it('disables empty scopes, responds to live tree changes and leaves Tags controls separate', async () => {
		const { view, directoryStore, buttons, row, inner, a, b, leftSidebar } = await setup()
		view.toggleOpen(a)
		directoryStore.remove(inner)
		directoryStore.notifyChanged()
		await tick()
		row('Note').focus()
		await tick()
		expect(buttons()[1].disabled).toBe(true)
		expect(buttons()[2].disabled).toBe(false)
		const added: TreeNode = { name: 'New', path: '/vault/A/New', fileType: 'folder', children: [], depth: 2 }
		directoryStore.add(added)
		directoryStore.notifyChanged()
		await tick()
		expect(buttons()[1].disabled).toBe(false)
		buttons()[1].click()
		expect(view.isItemOpen(added)).toBe(true)
		leftSidebar.currentTab.set('tags')
		await tick()
		expect(buttons()).toHaveLength(1)
		leftSidebar.currentTab.set('files')
		directoryStore.remove(a)
		directoryStore.remove(b)
		directoryStore.notifyChanged()
		await tick()
		expect(buttons()[1].disabled).toBe(true)
		expect(buttons()[2].disabled).toBe(true)
	})
})
