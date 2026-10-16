import { h } from 'typewriter-editor/rendering/vdom'
import { hasCollapsedChildren } from './sections'

export function foldedText(children: any[]) {
	return h('span', { className: 'folded-text' }, [
		h('span', { className: 'folded-text-content' }, children),
		h('span', { className: 'folded-text-marker', contentEditable: false, 'aria-hidden': 'true' })
	])
}

export function foldedLineChildren(attributes, children: any[]) {
	if (!hasCollapsedChildren(attributes.collapsed)) return children
	// List markers paint outside the text box, so they must stay outside its mask.
	let prefix = 0
	while (prefix < children.length) {
		const classes = children[prefix]?.props?.className ?? children[prefix]?.props?.class ?? ''
		if (!classes.split(/\s+/).includes('line_format')) break
		prefix++
	}
	return [...children.slice(0, prefix), foldedText(children.slice(prefix))]
}
