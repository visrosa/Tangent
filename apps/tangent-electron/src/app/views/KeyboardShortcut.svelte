<script lang="ts">
import { shortcutDisplayKeys, shortcutDisplayString } from 'app/utils/shortcuts'
import 'app/style/keycaps.scss'

export let shortcut: string

$: keys = shortcutDisplayKeys(shortcut)
</script>

<kbd class="keyboard-input keyboard-display" class:keyboard-input-group={keys.length > 1}
	aria-label={shortcutDisplayString(shortcut)}>
	{#if keys.length > 1}
		{#each keys as key}<kbd class="keyboard-input">{key}</kbd>{/each}
	{:else}
		{keys[0]}
	{/if}
</kbd>
