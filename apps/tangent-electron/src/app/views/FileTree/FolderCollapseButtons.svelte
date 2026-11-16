<script lang="ts">
import type DirectoryView from 'app/model/directoryView'
import type { FolderToggleScope } from 'app/model/directoryView'
import type { TreeNode } from 'common/trees'

export let directoryView: DirectoryView
export let focusedItem: TreeNode = null

const scopes: FolderToggleScope[] = ['level', 'all']

$: actions = scopes.map(scope => {
	const state = $directoryView.getFolderToggleState(scope, focusedItem)
	return {
		scope,
		...state,
		label: `${state.collapse ? 'Collapse' : 'Expand'} ${scope === 'all' ? 'all folders' : `folders at current level (${state.parent.name})`}`
	}
})
</script>

{#each actions as action}
	<button
		type="button"
		class="subtle"
		aria-label={action.label}
		title={action.label}
		disabled={!action.folders.length}
		on:click={() => directoryView.toggleFolders(action.scope, focusedItem)}
	>
		<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
			{#if action.scope === 'all'}
				<path d="M5 4 7 2 11 2 13 4 23 4 23 17" />
			{/if}
			<use href="folder.svg#folder" />
			<g class:expand={!action.collapse}>
				<path d={action.scope === 'all' ? 'M9 11 12 9 15 11 M9 15 12 13 15 15' : 'M9 14 12 11 15 14'} />
			</g>
		</svg>
	</button>
{/each}

<style>
button {
	flex-shrink: 0;
}
svg {
	--iconStroke: currentColor;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.expand {
	transform: rotate(180deg);
	transform-origin: 12px 12px;
}
</style>
