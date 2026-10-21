export function getLineBounds(line: HTMLElement): DOMRect {
	const bounds = line.getBoundingClientRect()
	if (!line.classList.contains('association-list-term')) return bounds
	const term = line.querySelector(':scope > .association-list-term-content')
	if (!term) return bounds
	// Source wrappers can span descendants or shared values; the gutter belongs to the term.
	const termBounds = term.getBoundingClientRect()
	return new DOMRect(bounds.x, termBounds.y, bounds.width, termBounds.height)
}

export type LineTarget = { element: HTMLElement, index: number }

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
