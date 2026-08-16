import type { FormatType } from 'typewriter-editor/typesetting'
import { h, type VChild } from 'typewriter-editor/rendering/vdom'
import type { AttributeMap } from '@typewriter/document'

/**
 * Shared shape for inline formats that keep the raw Markdown source around as a
 * hidden, cursor-navigable span alongside an always-rendered output element
 * (e.g. inline math's `<t-math>`, furigana's `<ruby>`). Reveal state only ever
 * toggles the source span's `hidden`/`revealed` classes; the output is never
 * hidden, so there's no CSS side-channel for a consumer to reach around.
 *
 * `name` also doubles as the attribute key holding the format's data
 * (`attributes[name]`) and derives the conventional selector/class names.
 */
export function hiddenGroupEmbedFormat<Data>(options: {
	name: string
	renderOutput: (data: Data, revealed: boolean) => VChild
}): FormatType {
	const { name, renderOutput } = options

	const sourceClass = `${name}-source`
	const hiddenSourceClass = `${sourceClass} hidden`
	const containerClass = `inline-${name}-container`

	return {
		name,
		selector: `span.${sourceClass}`,
		render: (attributes: AttributeMap, children) => {
			const revealed = !!attributes.revealed

			const containerAttr = {
				className: containerClass + (revealed ? ' revealed' : '')
			}

			const sourceAttr = {
				className: hiddenSourceClass + (revealed ? ' revealed' : '')
			}

			return h('span', containerAttr, [
				h('span', sourceAttr, children),
				renderOutput(attributes[name] as Data, revealed)
			])
		}
	}
}
