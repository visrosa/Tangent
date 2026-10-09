import { markAsSelectionRequest } from 'app/events'
import { defineCustomElement } from 'app/utils/defineCustomElement'
import { requestTooltip, tooltip } from 'app/utils/tooltips'

const glossStyleSheet = new CSSStyleSheet()
glossStyleSheet.replaceSync(`
	.base {
		text-decoration-line: underline;
		text-decoration-color: var(--accentTextColor);
		text-decoration-thickness: .1em;
		text-underline-offset: .12em;
	}
	.indicator {
		margin-inline-start: .18em;
		font-size: .62em;
		/* Keeps the raised indicator from growing the line box. */
		line-height: 0;
		color: var(--accentTextColor);
	}
`)

// Tooltip.svelte renders string tooltips as HTML; descriptions are plain text.
export function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

/**
 * Renders a gloss's base with an indicator and shows its description as a
 * tooltip. Not keyboard-focusable: Tab belongs to the editor (indent), and
 * moving the caret into the span already reveals the full source.
 */
class TangentGloss extends HTMLElement {

	private baseNode: HTMLElement
	private tooltipAction: ReturnType<typeof tooltip> | null = null
	private touched = false

	constructor() {
		super()

		this.addEventListener('click', this.onClick)
		this.addEventListener('dblclick', this.onClick)
		this.addEventListener('mousedown', this.onClick)
		this.addEventListener('contextmenu', this.onClick)
		this.addEventListener('pointerdown', this.onPointerDown)

		const shadow = this.attachShadow({ mode: 'open' })
		shadow.adoptedStyleSheets = [glossStyleSheet]

		const base = document.createElement('span')
		base.className = 'base'
		const indicator = document.createElement('sup')
		indicator.className = 'indicator'
		indicator.textContent = 'ⓘ'
		indicator.setAttribute('aria-hidden', 'true')
		shadow.append(base, indicator)

		this.baseNode = base
	}

	static get observedAttributes() {
		return ['base', 'description']
	}

	connectedCallback() {
		this.tooltipAction = tooltip(this, this.tooltipConfig())
	}

	disconnectedCallback() {
		this.tooltipAction?.destroy()
		this.tooltipAction = null
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (newValue === oldValue) return

		if (name === 'base') {
			this.baseNode.textContent = newValue ?? ''
		}
		else if (name === 'description') {
			this.setAttribute('aria-description', newValue ?? '')
			this.tooltipAction?.update(this.tooltipConfig())
		}
	}

	tooltipConfig() {
		return {
			tooltip: escapeHtml(this.getAttribute('description') ?? ''),
			placement: 'top' as const,
			maxWidth: '32rem'
		}
	}

	onPointerDown(event: PointerEvent) {
		this.touched = event.pointerType === 'touch' || event.pointerType === 'pen'
	}

	onClick(event: MouseEvent) {
		const hiddenGroup = this.closest('[data-hidden-group]')?.getAttribute('data-hidden-group')
		if (!hiddenGroup) return

		markAsSelectionRequest(event, {
			inline: attr => {
				return attr?.hiddenGroup === hiddenGroup
			}
		})

		if (event.type === 'click' && this.touched) {
			this.touched = false
			// The tooltip action drops its tooltip on click; reopen afterwards so
			// touch input, which has no hover, can still read the description.
			queueMicrotask(() => requestTooltip(this, this.tooltipConfig()))
		}
	}
}

defineCustomElement('t-gloss', TangentGloss)
export default TangentGloss
