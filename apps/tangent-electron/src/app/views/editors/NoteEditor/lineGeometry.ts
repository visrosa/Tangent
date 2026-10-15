export function getLineBounds(line: HTMLElement): DOMRect {
	const bounds = line.getBoundingClientRect()
	if (!line.classList.contains('dl-shared-inline')) return bounds
	const term = line.querySelector(':scope > .dl-term-content')
	if (!term) return bounds
	// A shared source wrapper spans the group, but its gutter belongs to its term.
	const termBounds = term.getBoundingClientRect()
	return new DOMRect(bounds.x, termBounds.y, bounds.width, termBounds.height)
}
