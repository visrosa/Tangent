import { describe, expect, it } from 'vitest'
import { mount, unmount } from 'svelte'
import KeyboardShortcut from './KeyboardShortcut.svelte'
import { shortcutDisplayString } from 'app/utils/shortcuts'

describe('shortcut keycaps', () => {
	it.each(['Mod+Shift+[', 'Mod++', 'Mod+-', 'ArrowLeft', 'Mod+Very long label'])('keeps the full binding label: %s', async shortcut => {
		const button = document.createElement('button')
		document.body.append(button)
		const component = mount(KeyboardShortcut, { target: button, props: { shortcut } })
		try {
			expect(button.querySelectorAll('kbd')).toHaveLength(1)
			expect(button.textContent).toBe(shortcutDisplayString(shortcut))
			expect(button.querySelector('kbd').getBoundingClientRect().width).toBeGreaterThan(0)
		} finally { await unmount(component); button.remove() }
	})
})
