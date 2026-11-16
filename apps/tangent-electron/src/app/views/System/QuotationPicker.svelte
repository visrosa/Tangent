<script lang="ts">
import PopUpButton from 'app/utils/PopUpButton.svelte'
import { presetForLocales } from 'common/quotations'
import type { QuotationPreset, QuotationSeries } from 'common/quotations'

let {
	presets,
	value,
	systemLocales,
	customId,
	customSeries,
	customValid,
	onselect
}: {
	presets: QuotationPreset[]
	value: string
	systemLocales: string[]
	customId: string
	customSeries: QuotationSeries
	customValid: boolean
	onselect: (id: string) => void
} = $props()

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })

function languageName(tag: string) {
	try { return languageNames.of(tag) ?? tag } catch { return tag }
}

const baseOf = (tag: string) => tag.replace('_', '-').split('-')[0].toLowerCase()

/** A short specimen, so that the glyphs line up in one column and differ only where the conventions do */
function sample(series: QuotationSeries) {
	return `${series.primaryOpen}Aa${series.primaryClose} ${series.secondaryOpen}Aa${series.secondaryClose}`
}

interface Entry {
	id: string
	sample: string
	/** The person's own languages that use this series, in their order of preference */
	mine: string[]
	/** The other languages with this series */
	others: string[]
	rank: number
}

let entries = $derived.by(() => {
	const result: Entry[] = presets.map(preset => {
		const mine: string[] = []
		const covered = new Set<string>()
		let rank = Infinity
		systemLocales.forEach((tag, index) => {
			if (presetForLocales([tag])?.preset.id !== preset.id) return
			rank = Math.min(rank, index)
			covered.add(baseOf(tag))
			// The convention belongs to the language, so regional variants add nothing here
			const name = languageName(baseOf(tag))
			if (!mine.includes(name)) mine.push(name)
		})
		// Region tags (zh-TW) belong to a script or language already listed
		const others = preset.locales
			.filter(l => !/-[A-Z]{2}$/.test(l) && !covered.has(baseOf(l)))
			.map(languageName)
		return { id: preset.id, sample: sample(preset.series), mine, others, rank }
	})
	// Stable: the presets keep their own order (roughly by number of speakers) within a group
	return result
		.map((entry, index) => ({ entry, index }))
		.sort((a, b) => (a.entry.rank - b.entry.rank) || (a.index - b.index) || 0)
		.map(({ entry }) => entry)
})

let hasMine = $derived(entries.some(e => e.mine.length > 0))
let current = $derived(entries.find(e => e.id === value))

/** The closed button has room for little: the glyphs, then up to two names and a count */
let summary = $derived.by(() => {
	if (value === customId) return customValid ? 'Custom' : 'Custom (invalid)'
	if (!current) return ''
	const names = [...current.mine, ...current.others]
	const shown = names.slice(0, 2).join(', ')
	return names.length > 2 ? `${shown} +${names.length - 2}` : shown
})
let buttonSample = $derived(
	value === customId ? (customValid ? sample(customSeries) : '') : current?.sample ?? '')

function choose(id: string) {
	onselect(id)
}

function menuKey(event: KeyboardEvent) {
	if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
	const rows = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.row')]
	const at = rows.indexOf(document.activeElement as HTMLElement)
	const next = rows[(at + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]
	next?.focus()
	event.preventDefault()
}
</script>

<PopUpButton buttonClass="grow quotationPicker" closeMenuOnClick={true} showPopUpIndicator={true}>
	{#snippet button()}
		<span class="sample">{buttonSample}</span>
		<span class="summary">{summary}</span>
	{/snippet}
	{#snippet menu()}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="list" role="menu" tabindex="-1" onkeydown={menuKey}>
			{#each entries as entry, index (entry.id)}
				{@const mine = entry.mine.length > 0}
				{#if hasMine && (index === 0 || mine !== (entries[index - 1].mine.length > 0))}
					<h4 class="heading">{mine ? 'Your languages' : 'Other languages'}</h4>
				{/if}
				<button
					class="row"
					class:menu-item={entry.id === value}
					role="menuitemradio"
					aria-checked={entry.id === value}
					title={[...entry.mine, ...entry.others].join(', ')}
					onclick={() => choose(entry.id)}
				>
					<span class="mark" aria-hidden="true">{entry.id === value ? '✓' : ''}</span>
					<span class="sample">{entry.sample}</span>
					<span class="languages">
						{#if mine}<strong>{entry.mine.join(', ')}</strong>{#if entry.others.length}<span class="rest">, {entry.others.join(', ')}</span>{/if}
						{:else}<span class="rest">{entry.others.join(', ')}</span>{/if}
					</span>
				</button>
			{/each}
			<button
				class="row"
				class:menu-item={value === customId}
				role="menuitemradio"
				aria-checked={value === customId}
				onclick={() => choose(customId)}
			>
				<span class="mark" aria-hidden="true">{value === customId ? '✓' : ''}</span>
				<span class="sample">{customValid ? sample(customSeries) : '—'}</span>
				<span class="languages"><span class="rest">Choose each mark yourself</span></span>
			</button>
		</div>
	{/snippet}
</PopUpButton>

<style lang="scss">
.list {
	display: flex;
	flex-direction: column;
	width: min(26em, 90vw);
	max-height: 80vh;
	overflow-y: auto;
	padding: .5em;
}

.heading {
	margin: .6em .5em .2em;
	font-size: .75em;
	font-weight: normal;
	text-transform: uppercase;
	letter-spacing: .06em;
	color: var(--deemphasizedTextColor);

	&:first-child {
		margin-top: .2em;
	}
}

.row {
	display: grid;
	// check mark | specimen | languages; the specimen column is fixed so the glyphs form a scannable column
	grid-template-columns: 1.2em 8em 1fr;
	align-items: baseline;
	column-gap: .5em;
	padding: .35em .5em;
	text-align: left;
	background: none;
	border: none;
	border-radius: var(--inputBorderRadius);
	color: inherit;
	font: inherit;
	cursor: pointer;

	&:hover, &:focus-visible {
		background-color: var(--accentActiveBackgroundColor);
		outline: none;
	}
}

.mark {
	color: var(--accentTextColor);
}

.sample {
	font-family: Georgia, 'Times New Roman', serif;
	font-size: 1.15em;
	white-space: nowrap;
}

.languages {
	line-height: 1.3;
	overflow-wrap: anywhere;

	.rest {
		color: var(--deemphasizedTextColor);
	}
}

.summary {
	color: var(--deemphasizedTextColor);
	margin-left: .6em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
