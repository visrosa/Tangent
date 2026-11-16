import fs from 'fs'
import path from 'path'
import { dialog, shell, type BrowserWindow } from 'electron'
import type { DeletionMode } from 'common/WindowApi'

export function validateDeletionMode(mode: unknown): asserts mode is DeletionMode {
	if (mode !== 'trash' && mode !== 'permanent') throw new Error('Invalid deletion mode')
}

export async function confirmPermanentDeletion(window: BrowserWindow, filepath: string) {
	const result = await dialog.showMessageBox(window, {
		type: 'warning',
		message: `Permanently delete “${path.basename(filepath)}”?`,
		detail: `${filepath}\n\nThis item and any contents will be permanently removed. They cannot be recovered from the Trash.`,
		buttons: ['Cancel', 'Delete Permanently'],
		defaultId: 0,
		cancelId: 0,
		noLink: true
	})
	return result.response === 1
}

export async function removeFile(filepath: string, mode: DeletionMode = 'trash') {
	validateDeletionMode(mode)
	if (mode === 'permanent') {
		await fs.promises.rm(filepath, { recursive: true })
	} else {
		await shell.trashItem(filepath)
	}
}
