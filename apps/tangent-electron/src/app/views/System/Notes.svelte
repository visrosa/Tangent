<script lang="ts">
import { getContext } from 'svelte'
import type Workspace from 'app/model/Workspace'

import SettingView from './SettingView.svelte'

let workspace = getContext('workspace') as Workspace
let settings = workspace.settings

</script>

<main>
	<h2>Appearance</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.noteFont}
			getValues={workspace.api.system.getAllFonts} />
		<SettingView setting={settings.noteFontSize} name="Font Size" />
		<SettingView setting={settings.lineHeight} />
		<SettingView setting={settings.noteWidthMax} />
		<SettingView setting={settings.noteMargins} />
	</div>
	<div class="settingsGroup">
		<SettingView setting={settings.fixedTitle} />
		<SettingView setting={settings.hangingHeaders} />
		<SettingView setting={settings.cardViewCardsHoldAltToScroll} name="Require Alt to Scroll Cards" />
		<SettingView setting={settings.crossOutFinishedTodos} />
	</div>

	<h2>Editing</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.italicsCharacters} />
		<SettingView setting={settings.boldCharacters} />
		<SettingView setting={settings.defaultTodoCompleteChar} />
		<SettingView setting={settings.allowInterTextUnderscoreFormatting} />
	</div>

	<h2>Links</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.linkCursor} />
		<SettingView setting={settings.noteLinkFollowBehavior} />
		<SettingView setting={settings.linkClickPaneBehavior} />
		<SettingView setting={settings.rawLinksAutoEmbed} />
		<SettingView setting={settings.collapseEmbedLinkLines} />
	</div>

	<h2>Code</h2>
	<div class="settingsGroup">
		<SettingView setting={settings.noteCodeFont}
			getValues={workspace.api.system.getAllFonts}/>
		<SettingView setting={settings.noteCodeInlineLightTheme}
			getValues={workspace.api.theme.getCodeThemes}
			includeDefault={false}/>
		<SettingView setting={settings.noteCodeBlockLightTheme}
			getValues={workspace.api.theme.getCodeThemes}
			includeDefault={false}/>
		<SettingView setting={settings.noteCodeInlineDarkTheme}
			getValues={workspace.api.theme.getCodeThemes}
			includeDefault={false}/>
		<SettingView setting={settings.noteCodeBlockDarkTheme}
			getValues={workspace.api.theme.getCodeThemes}
			includeDefault={false}/>
		<SettingView setting={settings.noteCodeTabWidth}
			name="Tab Width"/>
	</div>
	<div class="settingsGroup">
		<SettingView setting={settings.letCodeExpand} />
		<SettingView setting={settings.allowUnknownHTMLTags} />
		<SettingView setting={settings.collapseFrontMatter} />
	</div>
</main>
	