/**
 * The built-in substitution pairs, as the settings page lists them: each
 * category groups pairs, where a pair is a typed source string and the
 * preferred target it becomes. The matching rules themselves live in
 * `UnicodeAutocompleter.ts` (some take a family of sources, such as `--+>`,
 * and offer further targets); this table only describes them, so the two must
 * be kept in step until the rules are built from one registry.
 */
export interface SubstitutionPair {
	source: string
	target: string
}

export interface SubstitutionGroup {
	/** The settings key suffix: `arrows` reads `arrowSubstitutions`, and so on */
	id: 'arrows' | 'dashes' | 'ellipsis'
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
