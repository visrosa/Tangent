import type { TreeNode } from 'common/trees'
import type { Workspace } from "..";
import type { CommandContext } from "./Command";
import WorkspaceCommand from "./WorkspaceCommand";
import { isWindows } from 'common/platform';
import type { DeletionMode } from 'common/WindowApi'

interface DeleteNodeCommandContext extends CommandContext {
	target?: TreeNode | string
}

export default class DeleteNodeCommand extends WorkspaceCommand {
	constructor(workspace: Workspace, readonly mode: DeletionMode = 'trash') {
		super(workspace)
	}

	execute(context: DeleteNodeCommandContext) {
		let target = context?.target ?? this.workspace.viewState.tangent.currentNode.value
		if (!target) return
		if (typeof target !== 'string') {
			target = target.path
		}

		return this.workspace.api.file.delete(target, this.mode)
	}

	getName() {
		return this.mode === 'permanent' ? 'Delete Permanently…' : `Move to ${isWindows ? 'Recycle Bin' : 'Trash'}`
	}

	getLabel(context: DeleteNodeCommandContext) {
		const target = context?.target ?? this.workspace.viewState.tangent.currentNode.value
		if (target && typeof target !== 'string') {
			return this.mode === 'permanent' ? `Delete "${target.name}" Permanently…` : `Move "${target.name}" to ${isWindows ? 'Recycle Bin' : 'Trash'}`
		}
		return this.getName()
	}

	canExecute(context?: DeleteNodeCommandContext) {
		return !!(context?.target ?? this.workspace.viewState.tangent.currentNode.value)
	}

	getTooltip(context?: CommandContext) {
		return this.mode === 'permanent'
			? 'Permanently removes this item after confirmation. It cannot be recovered from the Trash.'
			: `Moves this item to the ${isWindows ? 'Recycle Bin' : 'Trash'}.`
	}
}
