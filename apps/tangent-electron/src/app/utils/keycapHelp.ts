import { requestTooltip, dropTooltip } from './tooltips'

export function keycapHelp(node: HTMLElement) {
	const control = node.closest('button')
	function focus() {
		const text = document.createElement('span')
		text.textContent = node.getAttribute('aria-label')
		requestTooltip(control, { tooltip: text.innerHTML })
	}
	function blur() { dropTooltip(control, false) }
	control?.addEventListener('focus', focus)
	control?.addEventListener('blur', blur)
	return {
		destroy() {
			if (control) blur()
			control?.removeEventListener('focus', focus)
			control?.removeEventListener('blur', blur)
		}
	}
}
