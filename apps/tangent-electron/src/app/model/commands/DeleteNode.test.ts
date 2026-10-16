import { expect, it, vi } from 'vitest'
import DeleteNode from './DeleteNode'

it('keeps ordinary deletion recoverable and guards a missing target', async () => {
	const remove = vi.fn()
	const currentNode = { value: null as any }
	const workspace = { api: { file: { delete: remove } }, viewState: { tangent: { currentNode } } } as any
	const command = new DeleteNode(workspace)
	expect(command.canExecute()).toBe(false)
	command.execute({})
	expect(remove).not.toHaveBeenCalled()
	currentNode.value = { path: '/workspace/note.md', name: 'note' }
	await command.execute({})
	expect(remove).toHaveBeenCalledWith('/workspace/note.md', 'trash')
	await new DeleteNode(workspace, 'permanent').execute({ target: '/workspace/folder' })
	expect(remove).toHaveBeenLastCalledWith('/workspace/folder', 'permanent')
})
