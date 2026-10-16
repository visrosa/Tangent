import { h } from 'typewriter-editor/rendering/vdom'
import { hasCollapsedChildren } from './sections'

export function foldedText(children: any[]) {
	return h('span', { className: 'folded-text' }, [
		h('span', { className: 'folded-text-content' }, children),
		h('span', { className: 'folded-text-marker', contentEditable: false, 'aria-hidden': 'true' })
	])
}

export function foldedLineChildren(attributes, children: any[]) {
	return hasCollapsedChildren(attributes.collapsed) ? [foldedText(children)] : children
}
