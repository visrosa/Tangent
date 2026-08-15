import type { FormatType } from 'typewriter-editor/typesetting'
import { h, type VChild } from 'typewriter-editor/rendering/vdom'
import type { AttributeMap } from '@typewriter/document'

/**
 * Shared shape for inline formats that keep the raw Markdown source around as a
 * hidden, cursor-navigable span alongside an always-rendered output element
 * (e.g. inline math's `<t-math>`, furigana's `<ruby>`). Reveal state only ever
 * toggles the source span's `hidden`/`revealed` classes; the output is never
 * hidden, so there's no CSS side-channel for a consumer to reach around.
 */
export function hiddenGroupEmbedFormat(options: {
	name: string
	selector: string
	sourceClass: string
	containerClass: string
	renderOutput: (attributes: AttributeMap, revealed: boolean) => VChild
}): FormatType {
	const { name, selector, sourceClass, containerClass, renderOutput } = options

	return {
		name,
		selector,
		render: (attributes, children) => {
			const revealed = !!attributes.revealed
			const revealedSuffix = revealed ? ' revealed' : ''

			const containerAttr = {
				className: containerClass + revealedSuffix
			}

			const sourceAttr = {
				className: sourceClass + ' hidden' + revealedSuffix
			}

			return h('span', containerAttr, [
				h('span', sourceAttr, children),
				renderOutput(attributes, revealed)
			])
		}
	}
}
