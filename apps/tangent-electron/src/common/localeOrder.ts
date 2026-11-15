/**
 * Ordering of locale lists so that the languages a person already uses come first.
 *
 * "System" tags are the preferred languages the platform reports, most preferred first.
 */

function normalize(tag: string) {
	return tag.replace('_', '-').toLowerCase()
}

/**
 * How closely `tag` matches the system's preferred languages, lower being closer.
 * Order of preference: the earlier system tag wins; within one, an exact tag, then a
 * more specific tag (`en-GB-oxendict` for `en-GB`), then another region of the same language.
 * Returns Infinity when the language is not among the system's.
 */
export function systemRank(tag: string, systemTags: readonly string[]): number {
	const t = normalize(tag)
	const language = t.split('-')[0]
	let best = Infinity
	for (let i = 0; i < systemTags.length; i++) {
		const s = normalize(systemTags[i])
		let rank = Infinity
		if (t === s) rank = i * 3
		else if (t.startsWith(s + '-')) rank = i * 3 + 1
		else if (language === s.split('-')[0]) rank = i * 3 + 2
		best = Math.min(best, rank)
	}
	return best
}

/** Stable partition-and-sort: system languages first, in the system's order, then the rest as given. */
export function systemFirst<T>(items: readonly T[], tagOf: (item: T) => string, systemTags: readonly string[]): T[] {
	return items
		.map((item, index) => ({ item, index, rank: systemRank(tagOf(item), systemTags) }))
		.sort((a, b) => (a.rank - b.rank) || (a.index - b.index) || 0)
		.map(entry => entry.item)
}
