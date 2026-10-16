import { isMac, isWindows } from 'common/platform'
import { keyPresentation } from 'common/keyboardKeys.mjs'

// Installed documentation owns these labels; ordinary note keycaps remain literal.
export function documentationKeycaps(root: HTMLElement, enabled: boolean) {
	if (!enabled) return
	const observed = new Map<ShadowRoot, MutationObserver>()
	const platform = isMac ? 'darwin' : isWindows ? 'win32' : 'linux'
	function describe(shadow: ShadowRoot) {
		for (const cap of shadow.querySelectorAll('kbd:not(.keyboard-input-group)')) {
			const key = keyPresentation(cap.textContent, platform)
			cap.setAttribute('aria-label', key.name)
			if (key.tooltip) cap.setAttribute('title', key.tooltip)
			else cap.removeAttribute('title')
		}
		for (const group of shadow.querySelectorAll('kbd.keyboard-input-group')) {
			group.setAttribute('aria-label', Array.from(group.querySelectorAll('kbd:not(.keyboard-input-group)')).map(cap => cap.getAttribute('aria-label')).join(' + '))
		}
	}
	function scan() {
		for (const [shadow, observer] of observed) {
			if (!root.contains(shadow.host)) { observer.disconnect(); observed.delete(shadow) }
		}
		for (const preview of root.querySelectorAll('t-keyboard')) {
			const shadow = preview.shadowRoot
			if (!shadow || observed.has(shadow)) continue
			describe(shadow)
			const observer = new MutationObserver(() => describe(shadow))
			observer.observe(shadow, { childList: true, subtree: true, characterData: true })
			observed.set(shadow, observer)
		}
	}
	const observer = new MutationObserver(scan)
	observer.observe(root, { childList: true, subtree: true })
	scan()
	return { destroy() { observer.disconnect(); for (const observer of observed.values()) observer.disconnect() } }
}
