<script lang="ts">
import { getContext } from 'svelte'
import { Workspace } from 'app/model'
import SvgIcon from '../smart-icons/SVGIcon.svelte'
import { tooltip } from 'app/utils/tooltips'

const workspace = getContext('workspace') as Workspace

const ROWS = 5
const RAIL_THRESHOLD = 25

let words = $state<string[] | null>(null)
let newWord = $state('')
let cellElements = $state<Record<number, HTMLElement>>({})

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

async function load() {
	const list = await workspace.api.dictionary.getAllWords()
	words = [...list].sort(collator.compare)
}
load()

/** The rail letter for a word: its first base letter, or '#' when it has none. */
function railLetter(word: string) {
	const first = word.normalize('NFD').match(/\p{L}/u)?.[0]
	return first ? first.toLocaleUpperCase() : '#'
}

let letters = $derived.by(() => {
	// Maps each letter to the index of its first word
	const result = new Map<string, number>()
	words?.forEach((word, index) => {
		const letter = railLetter(word)
		if (!result.has(letter)) result.set(letter, index)
	})
	return result
})

async function removeWord(word: string) {
	await workspace.api.dictionary.removeWord(word)
	await load()
}

async function addWord() {
	const word = newWord.trim()
	if (!word || /\s/.test(word)) return
	await workspace.api.dictionary.addWord(word)
	newWord = ''
	await load()
}

function jumpTo(index: number) {
	cellElements[index]?.scrollIntoView({ inline: 'start', block: 'nearest' })
}
</script>

{#if words === null}
	<p>Loading Dictionary…</p>
{:else}
	<p class="info">
		These are the words you have saved to the custom dictionary.
		You can add words here, or remove any that were added in error.
	</p>
	<form class="add" onsubmit={e => { e.preventDefault(); addWord() }}>
		<input type="text" bind:value={newWord} placeholder="Add a word" aria-label="Add a word to the dictionary" />
		<button type="submit" disabled={!newWord.trim() || /\s/.test(newWord.trim())}>Add</button>
	</form>

	{#if words.length === 0}
		<p class="info">The custom dictionary is empty.</p>
	{:else}
		{#if words.length > RAIL_THRESHOLD}
			<nav class="rail" aria-label="Jump to letter">
				{#each [...letters] as [letter, index]}
					<button type="button" onclick={() => jumpTo(index)}>{letter}</button>
				{/each}
			</nav>
		{/if}
		<ul class="grid" style:--rows={ROWS}>
			{#each words as word, index (word)}
				<li bind:this={cellElements[index]}>
					<button
						type="button"
						class="delete"
						aria-label={`Remove "${word}" from the dictionary`}
						use:tooltip={`Remove "${word}" from the dictionary`}
						onclick={() => removeWord(word)}
					>
						<SvgIcon ref="close.svg#close" size={16} />
					</button>
					<span>{word}</span>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style lang="scss">
.add {
	display: flex;
	gap: .5em;
	margin-bottom: .75em;
}

.rail {
	display: flex;
	flex-wrap: wrap;
	gap: .125em;
	margin-bottom: .5em;

	button {
		min-width: 1.75em;
		padding: .125em .25em;
	}
}

.grid {
	list-style: none;
	margin: 0;
	padding: 0 0 .5em;
	display: grid;
	grid-template-rows: repeat(var(--rows), auto);
	grid-auto-flow: column;
	grid-auto-columns: minmax(10em, max-content);
	column-gap: 1.5em;
	overflow-x: auto;
}

li {
	display: flex;
	align-items: center;
	gap: .5em;
	padding: .125em .25em;
	white-space: nowrap;
}

button.delete {
	display: inline-flex;
	padding: 0;
	opacity: .35;

	&:hover, &:focus-visible {
		opacity: 1;
	}
}
</style>
