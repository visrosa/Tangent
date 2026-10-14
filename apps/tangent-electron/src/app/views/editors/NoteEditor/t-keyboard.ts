import { patch } from 'typewriter-editor/rendering/vdom'
import { markAsSelectionRequest } from 'app/events'
import { defineCustomElement } from 'app/utils/defineCustomElement'
import { renderKeyboardTree } from 'common/markdownModel/keyboardFormat'
import type { KeyboardData } from 'common/markdownModel/keyboard'

const keyboardStyleSheet = new CSSStyleSheet()
keyboardStyleSheet.replaceSync(`
	:host {
		display: inline-block;
		font-family: var(--codeFontFamily, monospace);
		font-size: .85em;
		max-inline-size: 100%;
		white-space: pre-wrap;
	}
	kbd {
		display: inline-block;
		box-sizing: border-box;
		max-inline-size: 100%;
		padding: .06em .3em;
		border: 1px solid color-mix(in srgb, currentColor 40%, var(--noteBackgroundColor, white));
		border-bottom-color: color-mix(in srgb, currentColor 60%, var(--noteBackgroundColor, white));
		border-radius: .25em;
		background-color: var(--buttonBackgroundColor, #e9e9e9);
		box-shadow: 0 .1em .1em rgb(0 0 0 / .18), inset 0 .05em 0 rgb(255 255 255 / .2);
		font: inherit;
		line-height: 1.2;
		overflow-wrap: anywhere;
		vertical-align: baseline;
	}
	.keyboard-input-group {
		padding: .14em;
		background-color: var(--embossedBackgroundColor, #f7f7f7);
	}
	kbd + kbd { margin-inline-start: .12em; }
`)

class TangentKeyboard extends HTMLElement {
	private outputRoot: HTMLElement

	constructor() {
		super()
		this.addEventListener('click', this.onClick)
		this.addEventListener('dblclick', this.onClick)
		this.addEventListener('mousedown', this.onClick)
		this.addEventListener('contextmenu', this.onClick)
		const shadow = this.attachShadow({ mode: 'open' })
		shadow.adoptedStyleSheets = [keyboardStyleSheet]
		this.outputRoot = document.createElement('span')
		shadow.appendChild(this.outputRoot)
	}

	static get observedAttributes() {
		return ['keyboard-data']
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (oldValue === newValue) return
		const keyboard = newValue ? JSON.parse(newValue) as KeyboardData : null
		patch(this.outputRoot, keyboard ? [renderKeyboardTree(keyboard)] : [])
	}

	onClick(event: MouseEvent) {
		const hiddenGroup = this.closest('[data-hidden-group]')?.getAttribute('data-hidden-group')
		if (!hiddenGroup) return
		markAsSelectionRequest(event, { inline: attributes => attributes?.hiddenGroup === hiddenGroup })
	}
}

defineCustomElement('t-keyboard', TangentKeyboard)
export default TangentKeyboard
