<script lang="ts">
import { getContext, tick } from 'svelte'
import { Workspace } from 'app/model'
import SvgIcon from '../smart-icons/SVGIcon.svelte'
import { tooltip } from 'app/utils/tooltips'

const workspace = getContext('workspace') as Workspace

/** Above this many words the letter rail appears. */
const RAIL_THRESHOLD = 25

let words = $state<string[] | null>(null)
let newWord = $state('')
let announcement = $state('')
let currentLetter = $state('')

let listElement = $state<HTMLElement>()
let removeButtons = $state<Record<string, HTMLButtonElement>>({})
let cellElements = $state<Record<string, HTMLElement>>({})

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })
const segmenter = new Intl.Segmenter()

async function load() {
	const list = await workspace.api.dictionary.getAllWords()
	words = [...list].sort(collator.compare)
}
load()

/** The rail letter for a word: its first grapheme with diacritics folded, or '#' when that is not a letter. */
function railLetter(word: string) {
	const first = segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? ''
	const base = first.normalize('NFD').replace(/\p{M}/gu, '')
	return /^\p{L}/u.test(base) ? base.toLocaleUpperCase() : '#'
}

/** Each rail letter, with the first word it starts. */
let letters = $derived.by(() => {
	const result = new Map<string, string>()
	for (const word of words ?? []) {
		const letter = railLetter(word)
		if (!result.has(letter)) result.set(letter, word)
	}
	return result
})

let invalid = $derived(!newWord.trim() || /\s/.test(newWord.trim()))

async function addWord() {
	const word = newWord.trim()
	if (!word || /\s/.test(word)) return
	await workspace.api.dictionary.addWord(word)
	newWord = ''
	await load()
	announcement = `Added "${word}" to the custom words`
}

async function removeWord(word: string) {
	const index = words?.indexOf(word) ?? -1
	await workspace.api.dictionary.removeWord(word)
	await load()
	announcement = `Removed "${word}" from the custom words`
	// Focus the word that moved into the removed word's place, else the one before it
	const next = words?.[Math.min(index, words.length - 1)]
	await tick()
	if (next !== undefined) removeButtons[next]?.focus()
}

function jumpTo(word: string) {
	const cell = cellElements[word]
	if (!listElement || !cell) return
	// The grid is positioned, so cell offsets are relative to it
	listElement.scrollTop = cell.offsetTop
}

function updateCurrentLetter() {
	if (!listElement) return
	const top = listElement.scrollTop
	let current = ''
	for (const [letter, word] of letters) {
		const cell = cellElements[word]
		if (cell && cell.offsetTop <= top + 1) current = letter
	}
	currentLetter = current || (letters.keys().next().value ?? '')
}

$effect(() => {
	// Recompute when the words change
	words
	letters
	tick().then(updateCurrentLetter)
})
</script>

<section class="customWords">
	<h3>Custom Words{words === null ? '' : ` (${words.length})`}</h3>

	<form class="add" onsubmit={e => { e.preventDefault(); addWord() }}>
		<input type="text" bind:value={newWord} placeholder="Add a word" aria-label="Add a custom word" />
		<button type="submit" disabled={invalid}>Add</button>
	</form>

	{#if words === null}
		<p class="info">Loading…</p>
	{:else if words.length === 0}
		<p class="info">No custom words yet.</p>
	{:else}
		<div class="listArea">
			{#if words.length > RAIL_THRESHOLD}
				<nav class="rail" aria-label="Jump to letter">
					{#each [...letters] as [letter, word]}
						<button
							type="button"
							class:current={letter === currentLetter}
							aria-label={`Words starting with ${letter}`}
							onclick={() => jumpTo(word)}
						>{letter}</button>
					{/each}
				</nav>
			{/if}
			<ul class="grid" bind:this={listElement} onscroll={updateCurrentLetter}>
				{#each words as word (word)}
					<li bind:this={cellElements[word]}>
						<button
							type="button"
							class="delete"
							bind:this={removeButtons[word]}
							aria-label={`Remove "${word}" from the custom words`}
							use:tooltip={`Remove "${word}"`}
							onclick={() => removeWord(word)}
						>
							<SvgIcon ref="close.svg#close" size={16} />
						</button>
						<span>{word}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	<div class="visuallyHidden" role="status" aria-live="polite">{announcement}</div>
</section>

<style lang="scss">
.customWords {
	display: flex;
	flex-direction: column;
	// The title, controls and list may take up to three quarters of the window,
	// so the subsection can stay in view at once.
	max-height: 75vh;
	min-height: 0;
}

h3 {
	margin: 1em 0 .5em;
}

.add {
	display: flex;
	gap: .5em;
	margin-bottom: .75em;
}

.listArea {
	display: flex;
	gap: .75em;
	min-height: 0;
	flex: 1 1 auto;
}

.rail {
	display: flex;
	flex-direction: column;
	gap: .125em;
	// Matches the list's height and scrolls when there are more letters than fit
	overflow-y: auto;
	min-height: 0;

	button {
		min-width: 1.75em;
		padding: .125em .25em;

		&.current {
			font-weight: bold;
			text-decoration: underline;
		}
	}
}

.grid {
	list-style: none;
	margin: 0;
	padding: 0;
	flex: 1 1 auto;
	min-height: 0;
	display: grid;
	// Words fill rows left to right and wrap into as many columns as fit,
	// so only the list's vertical scroll is ever needed.
	grid-template-columns: repeat(auto-fill, minmax(10em, 1fr));
	align-content: start;
	column-gap: 1.5em;
	overflow-y: auto;
	overflow-x: hidden;
	position: relative;
}

li {
	display: flex;
	align-items: center;
	gap: .5em;
	padding: .125em .25em;
	min-width: 0;

	span {
		overflow-wrap: anywhere;
	}
}

button.delete {
	display: inline-flex;
	flex: none;
	padding: 0;
	opacity: .5;

	&:hover, &:focus-visible {
		opacity: 1;
	}
}

.visuallyHidden {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
</style>
