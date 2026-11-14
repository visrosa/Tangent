<script lang="ts">
import { getContext } from 'svelte'
import { getLangNameFromCode } from 'language-name-map'
import type Workspace from 'app/model/Workspace'

import SettingView from './SettingView.svelte'
import CustomDictionary from './CustomDictionary.svelte'
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

	<h2>Custom Dictionary</h2>
	<CustomDictionary />
</main>
