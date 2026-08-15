class TangentFurigana extends HTMLElement {

	private baseNode: Text
	private readingNode: HTMLElement

	constructor() {
		super()

		const shadow = this.attachShadow({ mode: 'open' })

		const style = document.createElement('style')
		style.textContent = `
			ruby {
				ruby-position: over;
			}
			rt {
				font-size: .58em;
				color: var(--deemphasizedTextColor);
			}
		`
		shadow.appendChild(style)

		const ruby = document.createElement('ruby')
		const base = document.createTextNode('')
		const rt = document.createElement('rt')
		ruby.appendChild(base)
		ruby.appendChild(rt)
		shadow.appendChild(ruby)

		this.baseNode = base
		this.readingNode = rt
	}

	static get observedAttributes() {
		return ['base', 'reading']
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (name === 'base' || name === 'reading') {
			this.updateContent()
		}
	}

	connectedCallback() {
		if (this.isConnected) {
			this.updateContent()
		}
	}

	updateContent() {
		this.baseNode.textContent = this.getAttribute('base') ?? ''
		this.readingNode.textContent = this.getAttribute('reading') ?? ''
	}
}

customElements.define('t-furigana', TangentFurigana)
export default TangentFurigana
