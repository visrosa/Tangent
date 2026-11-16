import { requestTooltip, dropTooltip } from './tooltips'

export function keycapHelp(node: HTMLElement) {
	let control: HTMLButtonElement = null
	let destroyed = false
	function focus() {
		const text = document.createElement('span')
		text.textContent = node.getAttribute('aria-label')
		requestTooltip(control, { tooltip: text.innerHTML, placement: 'bottom-start', delay: 0 })
	}
	function blur() { dropTooltip(control, false) }
	// A Svelte action can run before its surrounding button is attached.
	queueMicrotask(() => {
		if (destroyed) return
		control = node.closest('button')
		control?.addEventListener('focus', focus)
		control?.addEventListener('blur', blur)
	})
	return {
		destroy() {
			destroyed = true
			if (control) blur()
			control?.removeEventListener('focus', focus)
			control?.removeEventListener('blur', blur)
		}
	}
}
