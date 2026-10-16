import path from 'path'
import { beforeEach, expect, it, vi } from 'vitest'
import { dialog } from 'electron'
import { selectWorkspacePath } from './selectWorkspacePath'

vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn(), showMessageBox: vi.fn() } }))
const rootPath = path.resolve('/workspace')
const workspace = {
	rootPath,
	containsPath(filepath: string) {
		const relative = path.relative(rootPath, filepath)
		return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)
	},
	contentsStore: { pathToRelativePath: (filepath: string) => path.relative(rootPath, filepath) }
} as any
beforeEach(() => vi.resetAllMocks())
function selection(...filePaths: string[]) {
	vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths })
}
it.each(['', 'assets', 'nested/assets'])('returns a workspace-relative folder for %s', async relative => {
	selection(path.join(rootPath, relative))
	expect(await selectWorkspacePath(null, workspace, { mode: 'folder' })).toBe(relative)
})
it('preserves cancellation without a setting value', async () => {
	vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] })
	expect(await selectWorkspacePath(null, workspace)).toBeUndefined()
})
it('rejects prefix-like sibling folders', async () => {
	selection(rootPath + '-other')
	vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 0, checkboxChecked: false })
	expect(await selectWorkspacePath(null, workspace)).toBeUndefined()
})
it('allows retrying an external selection', async () => {
	selection(path.resolve('/outside'))
	selection(path.join(rootPath, 'assets'))
	vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false })
	expect(await selectWorkspacePath(null, workspace)).toBe('assets')
})
it('retains permitted external paths and enables native multi-selection', async () => {
	const outside = path.resolve('/outside')
	selection(path.join(rootPath, 'assets'), outside)
	expect(await selectWorkspacePath(null, workspace, { allowExternal: 'true', selectMultiple: true })).toEqual(['assets', outside])
	expect(dialog.showOpenDialog).toHaveBeenCalledWith(null, expect.objectContaining({ properties: expect.arrayContaining(['multiSelections']) }))
})
