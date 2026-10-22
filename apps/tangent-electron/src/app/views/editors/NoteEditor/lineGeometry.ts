export function getLineBounds(line: HTMLElement): DOMRect {
	const bounds = line.getBoundingClientRect()
	if (!line.classList.contains('association-list-term')) return bounds
	if (line.classList.contains('association-list-shared-owner')) return bounds
	const term = line.querySelector(':scope > .association-list-term-content')
	if (!term) return bounds
	// Ordinary parents span descendants, but their gutter belongs to the term.
	const termBounds = term.getBoundingClientRect()
	return new DOMRect(bounds.x, termBounds.y, bounds.width, termBounds.height)
}

export type LineTarget = { element: HTMLElement, index: number }

export function getGutterColumnCount(lines: HTMLElement[]) {
	const edges: [number, number][] = []
	for (const line of lines) {
		const bounds = getLineBounds(line)
		if (bounds.height > 0) edges.push([bounds.top, 1], [bounds.bottom, -1])
	}
	edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
	let active = 0
	let columns = 1
	for (const [, change] of edges) {
		active += change
		columns = Math.max(columns, active)
	}
	return columns
}

export function getLineGutterTargets(root: HTMLElement, point: { x: number, y: number }) {
	const bounds = root.getBoundingClientRect()
	const left: LineTarget[] = []
	let right: LineTarget = null
	root.querySelectorAll<HTMLElement>('.line').forEach((element, index) => {
		const line = getLineBounds(element)
		if (point.y <= line.top || point.y > line.bottom) return
		const leftBound = Math.min(bounds.left, line.left)
		const rightBound = Math.max(bounds.right, line.right)
		if (point.x > leftBound - 50 && point.x < line.left + 150) left.push({ element, index })
		if (!right && point.x > line.right - 150 && point.x < rightBound + 50) right = { element, index }
	})
	return { left, right }
}
