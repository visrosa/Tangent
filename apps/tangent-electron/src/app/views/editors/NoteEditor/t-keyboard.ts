import keycapStyles from 'app/style/keycaps.scss?inline'
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
${keycapStyles}
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
