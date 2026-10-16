import { describe, expect, it } from 'vitest'
import { mount, unmount } from 'svelte'
import KeyboardShortcut from './KeyboardShortcut.svelte'
import { shortcutDisplayString } from 'app/utils/shortcuts'
import '../../../static/global.css'

describe('shortcut keycaps', () => {
	it('keeps key faces and labels inside a chord in hanging-indented prose', async () => {
		const paragraph = document.createElement('p')
		paragraph.style.textIndent = '-12px'
		paragraph.style.paddingInlineStart = '12px'
		paragraph.style.width = '400px'
		paragraph.append('Open the console with ')
		document.body.append(paragraph)
		const component = mount(KeyboardShortcut, { target: paragraph, props: { shortcut: 'Mod+Shift+I' } })
		try {
			const group = paragraph.querySelector('kbd')
			const bounds = group.getBoundingClientRect()
			for (const key of Array.from(group.children)) {
				const face = key.getBoundingClientRect()
				expect(face.left).toBeGreaterThan(bounds.left)
				expect(face.right).toBeLessThan(bounds.right)
				const label = document.createRange()
				label.selectNodeContents(key)
				expect(label.getBoundingClientRect().left).toBeGreaterThan(face.left)
			}
		} finally { await unmount(component); paragraph.remove() }
	})

	it.each([
		['Mod+C', ['Mod', 'C']],
		['Mod+Shift+[', ['Mod', 'Shift', '[']],
		['Mod++', ['Mod', '+']],
		['Mod+-', ['Mod', '-']],
		['+', ['+']],
		['Left', ['Left']],
		['Mod+Very long label', ['Mod', 'Very long label']],
	])('renders individual keys for %s', async (shortcut, keys) => {
		const button = document.createElement('button')
		document.body.append(button)
		const component = mount(KeyboardShortcut, { target: button, props: { shortcut } })
		try {
			const group = button.querySelector('kbd')
			const keycaps = keys.length > 1 ? Array.from(group.children) : [group]
			expect(keycaps.map(keycap => keycap.textContent)).toEqual(keys.map(shortcutDisplayString))
			expect(group.getAttribute('aria-label')).toBe(shortcutDisplayString(shortcut))
			expect(group.classList.contains('keyboard-input-group')).toBe(keys.length > 1)
			for (const keycap of keycaps) {
				expect(keycap.tagName).toBe('KBD')
				expect(keycap.getBoundingClientRect().width).toBeGreaterThan(0)
				expect(getComputedStyle(keycap).fontSize).toBe(getComputedStyle(group).fontSize)
			}
			for (let index = 1; index < keycaps.length; index++) {
				expect(keycaps[index].getBoundingClientRect().left).toBeGreaterThan(keycaps[index - 1].getBoundingClientRect().right)
			}
		} finally { await unmount(component); button.remove() }
	})
})
