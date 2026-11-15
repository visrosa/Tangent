/**
 * The built-in substitution pairs, as the settings page lists them: each
 * category groups pairs, where a pair is a typed source string and the
 * preferred target it becomes. The matching rules themselves live in
 * `substitutionRules` below (some take a family of sources, such as `--+>`,
 * and offer further targets); this table only describes them, so the two must
 * be kept in step until the rules are built from one registry.
 */

export type SubstitutionGroupId = 'arrows' | 'dashes' | 'ellipsis'

/** What typing a source does: nothing, offer the target, or replace it on a boundary. */
export type SubstitutionMode = 'off' | 'suggest' | 'auto'

/**
 * A matcher over typed text. `replace[0]` is the preferred target, the one
 * Auto-Replace applies; Suggest lists them all.
 */
export interface SubstitutionRule {
	match: RegExp
	replace: string[]
	/** Dodges `---` Markdown formatting collisions at the start of a line */
	mustBeMidLine?: boolean
	group: SubstitutionGroupId
}

/** Ordered so that a longer source is tried before its prefix (`--+>` before `->`, `---` before `--`). */
export const substitutionRules: SubstitutionRule[] = [
	{ match: /--+>/, replace: ['➞', '➝', '→', '⟶'], group: 'arrows' },
	{ match: /->/, replace: ['→', '➝', '➞', '⟶'], group: 'arrows' },
	{ match: /<--+/, replace: ['⟵', '←'], group: 'arrows' },
	{ match: /<-/, replace: ['←', '⟵'], group: 'arrows' },
	{ match: /==>/, replace: ['⟹', '⇒'], group: 'arrows' },
	{ match: /=>/, replace: ['⇒', '⟹'], group: 'arrows' },
	{ match: /<==/, replace: ['⟸', '⇐'], group: 'arrows' },
	{ match: /<=/, replace: ['⇐', '⟸'], group: 'arrows' },
	{ match: /---/, replace: ['—', '–'], mustBeMidLine: true, group: 'dashes' },
	{ match: /--/, replace: ['–', '—'], mustBeMidLine: true, group: 'dashes' },
	// Only two periods are required so that the keystrokes match three (. . Enter)
	{ match: /\.\.+/, replace: ['…'], group: 'ellipsis' }
]

export interface SubstitutionPair {
	source: string
	target: string
}

export interface SubstitutionGroup {
	/** The settings key suffix: `arrows` reads `arrowSubstitutions`, and so on */
	id: SubstitutionGroupId
	label: string
	pairs: SubstitutionPair[]
}

export const substitutionGroups: SubstitutionGroup[] = [
	{
		id: 'arrows',
		label: 'Arrows',
		pairs: [
			{ source: '->', target: '→' },
			{ source: '-->', target: '➞' },
			{ source: '<-', target: '←' },
			{ source: '<--', target: '⟵' },
			{ source: '=>', target: '⇒' },
			{ source: '==>', target: '⟹' },
			{ source: '<=', target: '⇐' },
			{ source: '<==', target: '⟸' }
		]
	},
	{
		id: 'dashes',
		label: 'Dashes',
		pairs: [
			{ source: '--', target: '–' },
			{ source: '---', target: '—' }
		]
	},
	{
		id: 'ellipsis',
		label: 'Ellipsis',
		pairs: [
			{ source: '..', target: '…' }
		]
	}
]
