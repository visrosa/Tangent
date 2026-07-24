import { dropTooltip, requestTooltip, tooltip } from 'app/utils/tooltips'

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;')
}

class TangentAnnotationDescription extends HTMLElement {
	private tooltipAction: ReturnType<typeof tooltip>
	private touched = false

	static get observedAttributes() {
		return ['base', 'description']
	}

	constructor() {
		super()
		this.addEventListener('focus', this.onFocus)
		this.addEventListener('blur', this.onBlur)
		this.addEventListener('pointerdown', this.onPointerDown)
		this.addEventListener('click', this.onClick)
	}

	connectedCallback() {
		if (!this.hasAttribute('tabindex')) this.tabIndex = 0
		if (!this.hasAttribute('role')) this.setAttribute('role', 'button')
		this.updateContent()
		this.tooltipAction = tooltip(this, this.tooltipConfig())
		// The renderer supplies a native fallback for environments where custom
		// elements do not upgrade. Avoid showing it alongside Tangent's tooltip.
		this.removeAttribute('title')
	}

	disconnectedCallback() {
		this.tooltipAction?.destroy()
		this.tooltipAction = null
	}

	attributeChangedCallback() {
		if (!this.isConnected) return
		this.updateContent()
		this.tooltipAction?.update(this.tooltipConfig())
	}

	private tooltipConfig() {
		return {
			tooltip: escapeHtml(this.getAttribute('description') ?? ''),
			placement: 'top' as const,
			maxWidth: '32rem'
		}
	}

	private updateContent() {
		const base = this.getAttribute('base') ?? ''
		const description = this.getAttribute('description') ?? ''
		this.replaceChildren(
			document.createTextNode(base),
			Object.assign(document.createElement('sup'), {
				className: 'inline-annotation-indicator',
				textContent: 'ⓘ'
			})
		)
		this.setAttribute('aria-label', `${base}: ${description}`)
	}

	private onFocus = () => {
		requestTooltip(this, this.tooltipConfig())
	}

	private onBlur = () => {
		dropTooltip(this, false)
	}

	private onPointerDown = (event: PointerEvent) => {
		this.touched = event.pointerType === 'touch' || event.pointerType === 'pen'
	}

	private onClick = () => {
		if (!this.touched) return
		this.touched = false
		// The shared tooltip action drops hover tooltips on click. Re-open after
		// that handler has run so touch users can tap to inspect the description.
		queueMicrotask(() => requestTooltip(this, this.tooltipConfig()))
	}
}

customElements.define('t-annotation', TangentAnnotationDescription)
export default TangentAnnotationDescription
