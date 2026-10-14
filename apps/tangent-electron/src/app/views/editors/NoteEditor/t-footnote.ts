import { markAsSelectionRequest } from 'app/events'
import { defineCustomElement } from 'app/utils/defineCustomElement'
import { dropTooltip, requestTooltip } from 'app/utils/tooltips'
import type { ResolvedFootnote } from 'common/markdownModel/footnotes'

const styles = new CSSStyleSheet()
styles.replaceSync(`
	:host(.revealed) { display: none; }
	button { font: inherit; font-size: .75em; vertical-align: super; line-height: 1; color: var(--linkColor, var(--textColor)); border: 0; padding: 0 .15em; background: none; cursor: pointer; }
	button.definition { vertical-align: baseline; }
`)

export default class TangentFootnote extends HTMLElement {
	private output: HTMLElement
	private resolved: ResolvedFootnote = null

	constructor() {
		super()
		const shadow = this.attachShadow({ mode: 'open' })
		shadow.adoptedStyleSheets = [styles]
		this.output = document.createElement('span')
		shadow.append(this.output)
		this.addEventListener('mousedown', event => event.preventDefault())
		this.addEventListener('click', event => {
			if (this.resolved?.number) {
				event.preventDefault()
				event.stopPropagation()
				dropTooltip(this, false)
				this.dispatchEvent(new CustomEvent('footnote-navigate', { bubbles: true, composed: true, detail: { element: this } }))
			}
			else {
				const group = this.closest('[data-hidden-group]')?.getAttribute('data-hidden-group')
				markAsSelectionRequest(event, { inline: attr => attr?.hiddenGroup === group })
			}
		})
		this.addEventListener('mouseover', event => {
			if (!this.resolved || this.hasAttribute('footnote-definition')) return
			const escaped = this.resolved.text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
			requestTooltip(this, { tooltip: `<div style="white-space:pre-wrap">${escaped}</div>`, maxWidth: '32em' }, event)
		})
		this.addEventListener('mouseout', () => dropTooltip(this))
	}

	static get observedAttributes() { return ['footnote-key', 'footnote-definition'] }
	attributeChangedCallback() {
		this.update(null)
		if (this.isConnected) this.requestResolution()
	}
	connectedCallback() { this.requestResolution() }
	disconnectedCallback() { dropTooltip(this, false) }
	private requestResolution() {
		this.dispatchEvent(new CustomEvent('footnote-resolve', { bubbles: true, composed: true }))
	}

	update(note: ResolvedFootnote) {
		this.resolved = note
		const definition = this.hasAttribute('footnote-definition')
		if (note?.number) {
			const button = document.createElement('button')
			button.type = 'button'
			button.textContent = String(note.number) + (definition ? ' ↩' : '')
			button.className = definition ? 'definition' : ''
			button.setAttribute('aria-label', definition ? `Return from footnote ${note.number}` : `Go to footnote ${note.number}: ${note.text}`)
			this.output.replaceChildren(button)
		}
		else {
			this.output.textContent = `[^${this.getAttribute('footnote-key') ?? ''}]${definition ? ':' : ''}`
		}
	}
}

defineCustomElement('t-footnote', TangentFootnote)
