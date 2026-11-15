/**
 * The substitution registry. A substitution is a typed source string and the
 * target it becomes. The built-in definitions below are the single source of
 * truth for the settings page, the suggestion popup and Auto-Replace; the user
 * may change each one's mode, source and target through overrides, which are
 * stored as one JSON setting keyed by the definition's id.
 */

export type SubstitutionGroupId = 'arrows' | 'dashes' | 'ellipsis'

/** What typing a source does: nothing, offer the target, or replace it on a boundary. */
export type SubstitutionMode = 'off' | 'suggest' | 'auto'

export const substitutionModes: SubstitutionMode[] = ['off', 'suggest', 'auto']

export interface SubstitutionDefinition {
	/** Stable key for overrides; never reused for a different pair */
	id: string
	group: SubstitutionGroupId
	/** The source as the settings page shows it */
	source: string
	/**
	 * What the built-in matches. Some definitions take a family of sources (`--+>`
	 * matches `-->`, `--->`, and so on), which a user-edited source replaces with
	 * its one literal string.
	 */
	match: RegExp
	/** `targets[0]` is the preferred target, the one Auto-Replace applies; Suggest lists them all */
	targets: string[]
	/** Dodges `---` Markdown formatting collisions at the start of a line */
	mustBeMidLine?: boolean
}

export const substitutionDefinitions: SubstitutionDefinition[] = [
	{ id: 'arrow-right-long', group: 'arrows', source: '-->', match: /--+>/, targets: ['➞', '➝', '→', '⟶'] },
	{ id: 'arrow-right', group: 'arrows', source: '->', match: /->/, targets: ['→', '➝', '➞', '⟶'] },
	{ id: 'arrow-left-long', group: 'arrows', source: '<--', match: /<--+/, targets: ['⟵', '←'] },
	{ id: 'arrow-left', group: 'arrows', source: '<-', match: /<-/, targets: ['←', '⟵'] },
	{ id: 'arrow-implies-long', group: 'arrows', source: '==>', match: /==>/, targets: ['⟹', '⇒'] },
	{ id: 'arrow-implies', group: 'arrows', source: '=>', match: /=>/, targets: ['⇒', '⟹'] },
	{ id: 'arrow-implied-long', group: 'arrows', source: '<==', match: /<==/, targets: ['⟸', '⇐'] },
	{ id: 'arrow-implied', group: 'arrows', source: '<=', match: /<=/, targets: ['⇐', '⟸'] },
	{ id: 'dash-em', group: 'dashes', source: '---', match: /---/, targets: ['—', '–'], mustBeMidLine: true },
	{ id: 'dash-en', group: 'dashes', source: '--', match: /--/, targets: ['–', '—'], mustBeMidLine: true },
	// Only two periods are required so that the keystrokes match three (. . Enter)
	{ id: 'ellipsis', group: 'ellipsis', source: '..', match: /\.\.+/, targets: ['…'] }
]

export interface SubstitutionOverride {
	/** Absent: the group's mode applies */
	mode?: SubstitutionMode
	/** Absent: the built-in source applies */
	source?: string
	/** Absent: the built-in preferred target applies */
	target?: string
}

export type SubstitutionOverrides = Record<string, SubstitutionOverride>

export type GroupModes = Record<SubstitutionGroupId, SubstitutionMode>

/** A definition with its overrides applied: what the matchers actually use. */
export interface ResolvedSubstitution {
	id: string
	group: SubstitutionGroupId
	source: string
	target: string
	mode: SubstitutionMode
	match: RegExp
	/** `match` anchored to the end of the text, for matching what precedes a boundary */
	anchored: RegExp
	/** `replace[0]` is the preferred target; Suggest lists every entry */
	replace: string[]
	mustBeMidLine: boolean
	/** Whether the user changed the source, which makes it a literal string */
	customSource: boolean
}

const knownIds = new Set(substitutionDefinitions.map(d => d.id))

function isMode(value: unknown): value is SubstitutionMode {
	return typeof value === 'string' && (substitutionModes as string[]).includes(value)
}

/**
 * Reads the stored JSON, dropping anything that is not a recognized override. A
 * malformed value is an empty set, never an error: a hand-edited settings file
 * must not disable the editor.
 */
export function parseOverrides(json: string | undefined | null): SubstitutionOverrides {
	if (!json) return {}
	let raw: unknown
	try {
		raw = JSON.parse(json)
	}
	catch {
		return {}
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

	const overrides: SubstitutionOverrides = {}
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!knownIds.has(id) || !value || typeof value !== 'object') continue
		const entry = value as Record<string, unknown>
		const clean: SubstitutionOverride = {}
		if (isMode(entry.mode)) clean.mode = entry.mode
		if (typeof entry.source === 'string' && entry.source) clean.source = entry.source
		if (typeof entry.target === 'string' && entry.target) clean.target = entry.target
		if (Object.keys(clean).length) overrides[id] = clean
	}
	return overrides
}

export function serializeOverrides(overrides: SubstitutionOverrides): string {
	const kept = Object.entries(overrides).filter(([, o]) => Object.keys(o).length)
	return kept.length ? JSON.stringify(Object.fromEntries(kept)) : ''
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Applies the overrides. The result is ordered so that a longer source is tried
 * before a shorter one (`---` before `--`), keeping the definitions' own order
 * among sources of equal length.
 */
export function resolveSubstitutions(groupModes: GroupModes, overrides: SubstitutionOverrides): ResolvedSubstitution[] {
	const resolved = substitutionDefinitions.map((def): ResolvedSubstitution => {
		const override = overrides[def.id] ?? {}
		const customSource = override.source !== undefined && override.source !== def.source
		const source = customSource ? override.source : def.source
		const match = customSource ? new RegExp(escapeRegExp(source)) : def.match
		const preferred = override.target ?? def.targets[0]
		return {
			id: def.id,
			group: def.group,
			source,
			target: preferred,
			mode: override.mode ?? groupModes[def.group],
			match,
			anchored: new RegExp(`(?:${match.source})$`, match.flags),
			replace: [preferred, ...def.targets.filter(t => t !== preferred)],
			mustBeMidLine: !!def.mustBeMidLine,
			customSource
		}
	})
	return resolved
		.map((rule, index) => ({ rule, index }))
		.sort((a, b) => b.rule.source.length - a.rule.source.length || a.index - b.index)
		.map(({ rule }) => rule)
}

/**
 * Why `source` → `target` cannot be stored for pair `id`, or null when it can.
 * `resolved` carries the effective sources of every pair, this one included.
 */
export function validateSubstitution(
	id: string, source: string, target: string, resolved: ResolvedSubstitution[]
): string | null {
	if (!source) return 'The source cannot be empty.'
	if (/\s/u.test(source)) return 'The source cannot contain whitespace.'
	if (!target) return 'The replacement cannot be empty.'
	if (target.includes(source)) return 'The replacement cannot contain its own source, or it would trigger again.'
	const clash = resolved.find(r => r.id !== id && r.source === source)
	if (clash) return `${source} is already the source of another substitution.`
	return null
}

/**
 * Overrides after setting one pair's fields, dropping fields that restate the
 * built-in value so that "reset" and "typed the default back" are the same state.
 */
export function withOverride(
	overrides: SubstitutionOverrides, id: string, change: SubstitutionOverride
): SubstitutionOverrides {
	const def = substitutionDefinitions.find(d => d.id === id)
	if (!def) return overrides
	const merged: SubstitutionOverride = { ...overrides[id] }
	for (const key of ['mode', 'source', 'target'] as const) {
		if (!(key in change)) continue
		const value = change[key]
		if (value === undefined) delete merged[key]
		else (merged as Record<string, string>)[key] = value
	}
	if (merged.source === def.source) delete merged.source
	if (merged.target === def.targets[0]) delete merged.target
	const next = { ...overrides }
	if (Object.keys(merged).length) next[id] = merged
	else delete next[id]
	return next
}

/** The slice of the workspace settings that decides which substitutions apply */
export interface SubstitutionSettings {
	arrowSubstitutions: { value: string }
	dashSubstitutions: { value: string }
	ellipsisSubstitutions: { value: string }
	substitutionOverrides: { value: string }
}

let memo: { key: string, rules: ResolvedSubstitution[] } | null = null

/**
 * The substitutions in force under the current settings. Typing consults this on
 * every keystroke, so the result is reused until a setting changes.
 */
export function resolveFromSettings(settings: SubstitutionSettings): ResolvedSubstitution[] {
	const modes = {
		arrows: settings.arrowSubstitutions.value,
		dashes: settings.dashSubstitutions.value,
		ellipsis: settings.ellipsisSubstitutions.value
	}
	const overridesJson = settings.substitutionOverrides.value
	const key = JSON.stringify([modes, overridesJson])
	if (memo?.key !== key) {
		const groupModes = Object.fromEntries(
			Object.entries(modes).map(([id, mode]) => [id, isMode(mode) ? mode : 'suggest'])
		) as GroupModes
		memo = { key, rules: resolveSubstitutions(groupModes, parseOverrides(overridesJson)) }
	}
	return memo.rules
}

export interface SubstitutionGroup {
	/** The settings key suffix: `arrows` reads `arrowSubstitutions`, and so on */
	id: SubstitutionGroupId
	label: string
}

export const substitutionGroups: SubstitutionGroup[] = [
	{ id: 'arrows', label: 'Arrows' },
	{ id: 'dashes', label: 'Dashes' },
	{ id: 'ellipsis', label: 'Ellipsis' }
]
