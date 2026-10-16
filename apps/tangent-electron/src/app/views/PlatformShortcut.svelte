<script lang="ts">
import { isMac, isWindows } from 'common/platform'
import { shortcutPresentation } from 'common/keyboardKeys.mjs'
import { keycapHelp } from 'app/utils/keycapHelp'
import 'app/style/keycaps.scss'

export let shortcut: string
$: keys = shortcutPresentation(shortcut, isMac ? 'darwin' : isWindows ? 'win32' : 'linux')
</script>

<kbd class="keyboard-input keyboard-display" class:keyboard-input-group={keys.length > 1}
	role="img" aria-label={keys.map(key => key.name).join(' + ')} use:keycapHelp>
	{#if keys.length > 1}
		{#each keys as key}<kbd class="keyboard-input" title={key.tooltip} aria-label={key.name}>{key.label}</kbd>{/each}
	{:else}
		<span title={keys[0].tooltip}>{keys[0].label}</span>
	{/if}
</kbd>
