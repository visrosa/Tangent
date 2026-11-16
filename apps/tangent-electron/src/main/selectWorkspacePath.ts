import { dialog, type BrowserWindow } from 'electron'
import type { SelectPathOptions } from 'common/WindowApi'
import type Workspace from './Workspace'

export async function selectWorkspacePath(window: BrowserWindow, workspace: Pick<Workspace, 'rootPath' | 'containsPath' | 'contentsStore'>, options?: SelectPathOptions) {
	const mode = options?.mode ?? 'path'

	let eOptions: Electron.OpenDialogOptions = {
		defaultPath: options?.initialPath ?? workspace.rootPath,
		message: options?.message ?? ('Select a ' + mode + '.'),
	}

	let buttonLabel = ''
	switch (mode) {
		case 'file':
			buttonLabel = 'Select File'
			eOptions.properties = ['createDirectory', 'openFile']
			break
		case 'folder':
			buttonLabel = 'Select Folder'
			eOptions.properties = ['createDirectory', 'openDirectory']
			break
		case 'path':
			buttonLabel = 'Select Path'
			eOptions.properties = ['createDirectory', 'openFile', 'openDirectory']
			break
	}

	if (options?.selectMultiple) eOptions.properties.push('multiSelections')

	eOptions.title = options?.title ?? buttonLabel
	eOptions.buttonLabel = buttonLabel

	async function selectPath() {
		let result = await dialog.showOpenDialog(window, eOptions)
	
		if (result && !result.canceled && result.filePaths.length > 0) {
			if (!options?.allowExternal && result.filePaths.find(f => !workspace.containsPath(f))) {
				const errorResult = await dialog.showMessageBox(
					window,
					{
						title: 'Must Be Within Workspace',
						message: `The selected ${mode} must be within the workspace.`,
						type: 'warning',
						buttons: ['Cancel', 'Select Folder']
					})
				if (errorResult.response === 1) {
					// Let the user select the folder again
					return await selectPath()
				}
			}
			else {
				// Workspace folders should always be relative
				const list = result.filePaths.map(f => workspace.containsPath(f) ? workspace.contentsStore.pathToRelativePath(f) : f)
				if (options?.selectMultiple) {
					return list
				}
				return list[0]
			}
		}
	}

	return await selectPath()
}
