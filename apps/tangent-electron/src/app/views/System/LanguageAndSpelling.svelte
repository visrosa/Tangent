<script lang="ts">
import { getContext } from 'svelte'
import { getLangNameFromCode } from 'language-name-map'
import type Workspace from 'app/model/Workspace'

import SettingView from './SettingView.svelte'
import CustomDictionary from './CustomDictionary.svelte'
import { isMac } from 'common/platform'
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

	return langs.map(l => {
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
			displayName
		}
	})
}
</script>

<main>
	<h2>Spelling</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.enableSpellCheck} />
		<SettingView setting={settings.filenameSpellCheck} />
		<SettingView setting={settings.contentSpellCheck} />
		{#if !isMac}
			<SettingView setting={settings.spellCheckLanguages}
				includeDefault={false}
				getValuesImmediately={true}
				showReset={true}
				getValues={getSpellCheckLanguages}/>
		{/if}
	</div>

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
			<label>
				Series
				<select
					value={effectivePresetId}
					onchange={e => $quotationPreset = e.currentTarget.value}
				>
					{#each quotationPresets as preset}
						<option value={preset.id}>{preset.name}</option>
					{/each}
					<option value={customQuotationPresetId}>Custom</option>
				</select>
			</label>
			<p class="info">
				{#if fromSystem}
					Preselected from your system language ({fromSystem.tag}).
				{:else}
					No preset matches your system language; the English series was preselected.
				{/if}
				Typing <code>"</code> or <code>'</code> offers these marks; nothing is replaced until you accept.
			</p>
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
			<p class="preview" aria-label="Preview">
				Quid {series.primaryOpen}Quod {series.secondaryOpen}Quae{series.secondaryClose} quod{series.primaryClose}
			</p>
		</div>
	{/if}

	<h2>Substitutions</h2>
	<p class="info">
		Typing these sequences offers a replacement. Choose Off to stop the offers for a group.
	</p>
	<div class="settingsGroup">
		<SettingView setting={settings.arrowSubstitutions} />
		<SettingView setting={settings.dashSubstitutions} />
		<SettingView setting={settings.ellipsisSubstitutions} />
	</div>

	<h2>Custom Dictionary</h2>
	<CustomDictionary />
</main>

<style lang="scss">
.quotationSeries {
	margin-bottom: 1.5em;
}

.preview {
	font-size: 1.1em;
}

.error {
	color: var(--textError, #b3261e);
}
</style>
