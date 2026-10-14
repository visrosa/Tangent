<script lang="ts">
import { getContext } from 'svelte'
import { readable, type Readable } from 'svelte/store'
import type { NoteOutlineControl } from '../editors/NoteEditor/outline'
import type { TreeNode } from 'common/trees'
import { File, Tangent, Workspace } from 'app/model'

import command from 'app/model/commands/CommandAction'
import SvgIcon from '../smart-icons/SVGIcon.svelte'
import WorkspaceTreeNode from 'app/model/WorkspaceTreeNode'
import { tooltip } from 'app/utils/tooltips'

export let node: TreeNode
export let tangent: Tangent

export let collapsedWidth = 32
export let supportDirty = false
export let outlineControl: Readable<NoteOutlineControl> = readable(null)

const workspace = getContext('workspace') as Workspace

$: workspaceNode = node instanceof WorkspaceTreeNode ? node as WorkspaceTreeNode : null
$: file = node instanceof File ? node as File : null
$: isDirty = supportDirty && (file ? $file.isDirty : false)

const {
	closeCurrentFile,
	closeLeftFiles,
	closeRightFiles
} = workspace.commands
</script>

<div class="verticalTitleBar"
	style:line-height={`${collapsedWidth}px`}
>
	<span class="buttons">
		<button use:command={{
				command: closeCurrentFile,
				context: { node, tangent }
			}}
			class="close subtle"
			class:dirty={isDirty}
			use:tooltip={isDirty ? 'This file has not been saved.' : 'Close this file.'}
		><SvgIcon
			ref={isDirty ? 'close.svg#close-dirty' : 'close.svg#close'}
		/></button>
		{#if $outlineControl}
			<button class="outline subtle" type="button"
				aria-label={$outlineControl.expanded ? 'Collapse outline' : 'Expand outline'}
				aria-expanded={$outlineControl.expanded}
				title={$outlineControl.expanded ? 'Collapse outline' : 'Expand outline'}
				on:click|stopPropagation={() => $outlineControl.toggle()}
			>☷</button>
		{/if}
		<!-- svelte-ignore a11y_consider_explicit_label -->
		<button use:command={{
			command: closeLeftFiles,
			context: { node, tangent }
		}} class="subtle" aria-label="Close files to the left"
		><svg style={`width: 24px; height: 24px;`}>
			<use href="close.svg#close-left"/>
		</svg></button>
		<!-- svelte-ignore a11y_consider_explicit_label -->
		<button use:command={{
			command: closeRightFiles,
			context: { node, tangent }
		}} class="subtle" aria-label="Close files to the right"
		><svg style={`width: 24px; height: 24px;`}>
			<use href="close.svg#close-right"/>
		</svg></button>
	</span>
	<span class="name">{workspaceNode ? $workspaceNode.name : node.name}</span>
</div>

<style lang="scss">
.verticalTitleBar {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	display: none;

	padding-top: var(--topBarHeight);

	writing-mode: vertical-lr;

	color: var(--deemphasizedTextColor);
	transition: color .3s;

	box-sizing: border-box;
	white-space: nowrap;
	overflow: hidden;

	:global(.current) & {
		color: var(--textColor);
	}

	.buttons {
		padding-inline-start: 6px;
	}
	
	button {
		box-sizing: border-box;
		width: 24px;
		height: 24px;
		padding: 0;
		
		opacity: 0;
		display: none;
		
		&.close.dirty {
			display: inline;
			opacity: .5;
		}
	}

	.name {
		padding-inline-start: 2em;
		display: none;
	}

	:global(.multiple) & {
		display: block;
		background-color: var(--noteBackgroundColor);

		button {
			display: inline;
			transition: opacity .3s;
			pointer-events: all;

			&.close, &.outline {
				opacity: .5;
			}
		}

		&:hover button, .name {
			display: inline;
			opacity: 1;
		}
	}
}

:global(.nodeContainer:first-child) .verticalTitleBar {
	border-left: none;
}
</style>