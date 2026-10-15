import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import { dialog, shell } from 'electron'
import { confirmPermanentDeletion, removeFile } from './fileDeletion'

vi.mock('electron', () => ({ shell: { trashItem: vi.fn() }, dialog: { showMessageBox: vi.fn() } }))
beforeEach(() => vi.restoreAllMocks())

describe('file deletion intent', () => {
	it('uses Trash for ordinary deletion', async () => {
		const rm = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined)
		await removeFile('/workspace/note.md')
		expect(shell.trashItem).toHaveBeenCalledWith('/workspace/note.md')
		expect(rm).not.toHaveBeenCalled()
	})
	it('never falls back to permanent removal after a Trash failure', async () => {
		const rm = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined)
		vi.mocked(shell.trashItem).mockRejectedValueOnce(new Error('Trash unavailable'))
		await expect(removeFile('/workspace/folder')).rejects.toThrow('Trash unavailable')
		expect(rm).not.toHaveBeenCalled()
	})
	it('requires a valid explicit permanent intent', async () => {
		const rm = vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined)
		await expect(removeFile('/workspace/note.md', 'invalid' as any)).rejects.toThrow('Invalid deletion mode')
		expect(rm).not.toHaveBeenCalled()
		await removeFile('/workspace/folder', 'permanent')
		expect(rm).toHaveBeenCalledWith('/workspace/folder', { recursive: true })
	})
	it.each([0, 1, -1, undefined])('accepts only the permanent confirmation button: %s', async response => {
		vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response, checkboxChecked: false })
		expect(await confirmPermanentDeletion(null, '/workspace/Folder')).toBe(response === 1)
		expect(dialog.showMessageBox).toHaveBeenLastCalledWith(null, expect.objectContaining({
			defaultId: 0, cancelId: 0, buttons: ['Cancel', 'Delete Permanently'],
			detail: expect.stringContaining('/workspace/Folder')
		}))
	})
	it('does not authorize deletion when the dialog fails', async () => {
		vi.mocked(dialog.showMessageBox).mockRejectedValueOnce(new Error('dialog closed'))
		await expect(confirmPermanentDeletion(null, '/workspace/note.md')).rejects.toThrow('dialog closed')
	})
})
