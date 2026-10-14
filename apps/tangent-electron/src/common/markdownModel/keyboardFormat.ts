import type { FormatType, LineType } from 'typewriter-editor/typesetting'
import { h, type VChild, type VNode } from 'typewriter-editor/rendering/vdom'
import type { KeyboardData } from './keyboard'
import { hiddenGroupEmbedFormat } from './hiddenGroupEmbed'
import { getHiddenGroupAttributes } from './inline'

export function renderKeyboardTree(data: KeyboardData): VNode {
	const children = data.children.map(child => typeof child === 'string'
		? child
		: renderKeyboardTree(child))
	const grouped = data.children.some(child => typeof child !== 'string')
	return h('kbd', { className: grouped ? 'keyboard-input keyboard-input-group' : 'keyboard-input' }, children)
}

const keyboardEmbedFormat = hiddenGroupEmbedFormat<KeyboardData>({
	name: 'keyboard',
	renderOutput: (keyboard, attributes) => h('t-keyboard', {
		'keyboard-data': JSON.stringify(keyboard),
		className: attributes.decoration?.focus?.class
	}, [])
})

export const keyboardFormat: FormatType = {
	...keyboardEmbedFormat,
	render: (attributes, children, line, editor, forHTML) => {
		if (forHTML) {
			const node = renderKeyboardTree(attributes.keyboard)
			Object.assign(node.props, getHiddenGroupAttributes(attributes))
			return node
		}
		return keyboardEmbedFormat.render(attributes, children, line, editor, forHTML)
	}
}

// The pinned Typewriter version doesn't pass forHTML to renderInline when
// rendering a whole document. Convert previews at the line export boundary.
export function withKeyboardHTMLExport(line: LineType): LineType {
	const result = { ...line }
	if (line.render) {
		result.render = (...args) => {
			const node = line.render(...args)
			return args[4] ? keyboardHTML(node) as VNode : node
		}
	}
	if (line.renderMultiple) {
		result.renderMultiple = (...args) => {
			const node = line.renderMultiple(...args)
			return args[2] ? keyboardHTML(node) as VNode : node
		}
	}
	return result
}

function keyboardHTML(child: VChild): VChild {
	if (!child || typeof child !== 'object') return child
	if (child.props?.className?.split(' ').includes('inline-keyboard-container')) {
		const output = child.children.find(node => typeof node === 'object' && node?.type === 't-keyboard') as VNode
		if (output) return renderKeyboardTree(JSON.parse(output.props['keyboard-data']))
	}
	return { ...child, children: child.children.map(keyboardHTML) }
}
