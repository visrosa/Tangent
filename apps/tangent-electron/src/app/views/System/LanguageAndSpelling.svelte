<script lang="ts">
import { getContext } from 'svelte'
import { getLangNameFromCode } from 'language-name-map'
import type Workspace from 'app/model/Workspace'

import SettingView from './SettingView.svelte'
import CustomWords from './CustomWords.svelte'
import { isMac } from 'common/platform'

let workspace = getContext('workspace') as Workspace
let settings = workspace.settings

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
	<h2>Editing Conventions</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.smartParagraphBreaks} />
		<SettingView setting={settings.autoSetChildListGlyphs} />
	</div>

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
