<script lang="ts">
import { shortcutDisplayString } from 'app/utils/shortcuts'
import 'app/style/keycaps.scss'

export let shortcut: string
</script>

<kbd class="keyboard-input keyboard-display">{shortcutDisplayString(shortcut)}</kbd>
