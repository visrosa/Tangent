<script lang="ts">
import { getContext } from 'svelte'
import type { Workspace } from 'app/model'
import {
	parseOverrides, resolveFromSettings, serializeOverrides, substitutionDefinitions,
	validateSubstitution, withOverride,
	type SubstitutionGroupId, type SubstitutionMode, type SubstitutionOverride
} from 'common/substitutions'

let { group, label }: { group: SubstitutionGroupId, label: string } = $props()

const workspace = getContext('workspace') as Workspace
const settings = workspace.settings
const overridesSetting = settings.substitutionOverrides

// The page keys this component by group, so the group never changes for one instance
// svelte-ignore state_referenced_locally
const groupSetting = {
	arrows: settings.arrowSubstitutions,
	dashes: settings.dashSubstitutions,
	ellipsis: settings.ellipsisSubstitutions
}[group]

const modeLabels: Record<SubstitutionMode, string> = { off: 'Off', suggest: 'Suggest', auto: 'Auto-Replace' }

let definitions = $derived(substitutionDefinitions.filter(d => d.group === group))
let overrides = $derived(parseOverrides($overridesSetting))
// Reading the setting values makes the resolved list follow every change to them
let resolved = $derived.by(() => {
	$overridesSetting; $groupSetting
	return resolveFromSettings(settings)
})

/** Text typed but not yet accepted, and why it was refused, per pair and field */
let drafts = $state<Record<string, { source?: string, target?: string }>>({})
let errors = $state<Record<string, string>>({})

function save(id: string, change: SubstitutionOverride) {
	$overridesSetting = serializeOverrides(withOverride(overrides, id, change))
}

function commit(id: string, field: 'source' | 'target', event: Event) {
	const input = event.currentTarget as HTMLInputElement
	const current = resolved.find(r => r.id === id)
	const source = field === 'source' ? input.value : current.source
	const target = field === 'target' ? input.value : current.target
	const error = validateSubstitution(id, source, target, resolved)
	if (error) {
		errors[id] = error
		drafts[id] = { ...drafts[id], [field]: input.value }
		return
	}
	delete errors[id]
	delete drafts[id]
	save(id, { [field]: input.value })
}

function setMode(id: string, value: string) {
	save(id, { mode: value === 'group' ? undefined : value as SubstitutionMode })
}

function reset(id: string) {
	delete errors[id]
	delete drafts[id]
	$overridesSetting = serializeOverrides(withOverride(
		withOverride(withOverride(overrides, id, { mode: undefined }), id, { source: undefined }),
		id, { target: undefined }
	))
}
</script>

<ul class="pairs" aria-label={`${label} substitutions`}>
	{#each definitions as def (def.id)}
		{@const rule = resolved.find(r => r.id === def.id)}
		{@const override = overrides[def.id]}
		<li>
			<input class="source" type="text" spellcheck="false" autocomplete="off"
				aria-label={`Source of the ${def.source} substitution`}
				aria-invalid={errors[def.id] ? 'true' : undefined}
				value={drafts[def.id]?.source ?? rule.source}
				onchange={e => commit(def.id, 'source', e)} />
			<span aria-hidden="true">→</span>
			<input class="target" type="text" spellcheck="false" autocomplete="off"
				aria-label={`Replacement for the ${def.source} substitution`}
				aria-invalid={errors[def.id] ? 'true' : undefined}
				value={drafts[def.id]?.target ?? rule.target}
				onchange={e => commit(def.id, 'target', e)} />
			<select aria-label={`Mode of the ${def.source} substitution`}
				value={override?.mode ?? 'group'}
				onchange={e => setMode(def.id, e.currentTarget.value)}>
				<option value="group">Same as {label} ({modeLabels[$groupSetting as SubstitutionMode]})</option>
				{#each Object.entries(modeLabels) as [value, text]}
					<option {value}>{text}</option>
				{/each}
			</select>
			<button type="button" class="reset" disabled={!override}
				aria-label={`Reset the ${def.source} substitution to its built-in values`}
				onclick={() => reset(def.id)}>Reset</button>
			{#if errors[def.id]}
				<p class="error" role="alert">{errors[def.id]}</p>
			{/if}
		</li>
	{/each}
</ul>

<style lang="scss">
.pairs {
	list-style: none;
	margin: 0 0 .5em;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: .35em;
}

li {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: .5em;
}

input {
	font-family: var(--fontMonospace, monospace);
	text-align: center;
}

.source { width: 6em; }
.target { width: 4em; }

.error {
	flex-basis: 100%;
	margin: 0;
	color: var(--textError, #b3261e);
}
</style>
