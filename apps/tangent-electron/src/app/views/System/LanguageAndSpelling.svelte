<script lang="ts">
import { getContext } from 'svelte'
import { getLangNameFromCode } from 'language-name-map'
import type Workspace from 'app/model/Workspace'

import SettingView from './SettingView.svelte'
import CustomWords from './CustomWords.svelte'
import QuotationPicker from './QuotationPicker.svelte'
import { systemFirst, systemRank } from 'common/localeOrder'
import { isMac } from 'common/platform'
import { substitutionGroups } from 'common/substitutions'
import {
	quotationPresets, customQuotationPresetId, defaultQuotationPresetId,
	presetForLocales, seriesFromSettings, validateSeries
} from 'common/quotations'

let workspace = getContext('workspace') as Workspace
let settings = workspace.settings

const typographicQuotes = settings.typographicQuotes
const quotationPreset = settings.quotationPreset
const customPrimaryOpen = settings.quotationCustomPrimaryOpen
const customPrimaryClose = settings.quotationCustomPrimaryClose
const customSecondaryOpen = settings.quotationCustomSecondaryOpen
const customSecondaryClose = settings.quotationCustomSecondaryClose

const systemLocales = typeof navigator !== 'undefined' ? [...navigator.languages] : []
const fromSystem = presetForLocales(systemLocales)

// Locale preselection enables nothing. The derived choice is stored the first
// time quotes are turned on, so a later locale change never reinterprets notes.
let effectivePresetId = $derived(
	$quotationPreset || fromSystem?.preset.id || defaultQuotationPresetId)
$effect(() => {
	if ($typographicQuotes && !$quotationPreset) {
		$quotationPreset = effectivePresetId
	}
})

const substitutionSettings = {
	arrows: settings.arrowSubstitutions,
	dashes: settings.dashSubstitutions,
	ellipsis: settings.ellipsisSubstitutions
}

let customSeries = $derived({
	primaryOpen: $customPrimaryOpen,
	primaryClose: $customPrimaryClose,
	secondaryOpen: $customSecondaryOpen,
	secondaryClose: $customSecondaryClose
})
let customError = $derived(effectivePresetId === customQuotationPresetId ? validateSeries(customSeries) : null)
let series = $derived(seriesFromSettings(effectivePresetId, customSeries, systemLocales))

async function getSpellCheckLanguages() {
	const langs = await workspace.api.system.getAllLanguages()
	const ordered = systemFirst(langs, l => l, systemLocales)
	const hasSystem = ordered.some(l => systemRank(l, systemLocales) < Infinity)

	return ordered.map(l => {
		const match = l.match(/(\w+)(-(.+))?/)
		const name = getLangNameFromCode(match[1])

		let displayName = name?.native ?? l

		if (name && name.native !== name.name) {
			displayName += ' – ' + name.name
		}

		if (match[2]) {
			displayName += ' – ' + match[3]
		}

		return {
			value: l,
			displayName,
			// Headings only help when there are two groups to tell apart
			group: hasSystem ? (systemRank(l, systemLocales) < Infinity ? 'Your languages' : 'Other languages') : undefined
		}
	})
}
</script>

<main>
	<h2>Editing Conventions</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.smartParagraphBreaks} />
		<SettingView setting={settings.autoSetChildListGlyphs} />
	</div>

	<h2>Quotation Marks</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.typographicQuotes} />
	</div>
	{#if $typographicQuotes}
		<div class="quotationSeries">
			<div class="pickerRow">
				<span>Typographic Quotes</span>
				<QuotationPicker
					presets={quotationPresets}
					value={effectivePresetId}
					{systemLocales}
					customId={customQuotationPresetId}
					customSeries={customSeries}
					customValid={validateSeries(customSeries) === null}
					onselect={id => $quotationPreset = id}
				/>
			</div>
			{#if effectivePresetId === customQuotationPresetId}
				<div class="settingsGroup">
					<SettingView setting={settings.quotationCustomPrimaryOpen} />
					<SettingView setting={settings.quotationCustomPrimaryClose} />
					<SettingView setting={settings.quotationCustomSecondaryOpen} />
					<SettingView setting={settings.quotationCustomSecondaryClose} />
				</div>
				{#if customError}
					<p class="error" role="alert">{customError} The English series is used until this is fixed.</p>
				{/if}
			{/if}
		</div>
	{/if}

	<h2>Substitutions</h2>
	<p class="info">
		Typing a source offers its replacement. Choose Off to stop the offers for a group.
	</p>
	{#each substitutionGroups as group}
		<h3>{group.label}</h3>
		<ul class="pairs" aria-label={`${group.label} substitutions`}>
			{#each group.pairs as pair}
				<li><code>{pair.source}</code> → <span>{pair.target}</span></li>
			{/each}
		</ul>
		<div class="settingsGroup">
			<SettingView setting={substitutionSettings[group.id]} />
		</div>
	{/each}

	<h2>Spell Check</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.enableSpellCheck} />
		{#if isMac}
			<p class="info">Spell check languages follow your system settings on macOS.</p>
		{:else}
			<SettingView setting={settings.spellCheckLanguages}
				includeDefault={false}
				getValuesImmediately={true}
				showReset={true}
				getValues={getSpellCheckLanguages}/>
		{/if}
		<SettingView setting={settings.filenameSpellCheck} />
		<SettingView setting={settings.contentSpellCheck} />
	</div>
	<CustomWords />
</main>

<style lang="scss">
.quotationSeries {
	margin-bottom: 1.5em;
}

.pairs {
	list-style: none;
	margin: 0 0 .5em;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: .25em 1.5em;
}

.pickerRow {
	display: flex;
	align-items: baseline;
	gap: .5em;

	> span {
		flex: none;
	}
}

.error {
	color: var(--textError, #b3261e);
}
</style>
