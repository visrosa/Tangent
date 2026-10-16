import { expect, it, vi } from 'vitest'
vi.mock('common/platform', () => ({ isMac: true }))
import { shortcutDisplayKeys, shortcutDisplayString } from './shortcuts'

it('keeps a literal plus key in Mac shortcut labels', () => {
	expect(shortcutDisplayString('Mod++')).toBe('⌘ +')
	expect(shortcutDisplayString('+')).toBe('+')
	expect(shortcutDisplayString('Mod+Shift+[')).toBe('⌘ ⇧ [')
})

it.each([
	['Mod+C', ['⌘', 'C']],
	['Mod+Ctrl+Alt+Shift+C', ['⌘', '⌃', '⌥', '⇧', 'C']],
	['Mod++', ['⌘', '+']],
	['Mod+Shift++', ['⌘', '⇧', '+']],
	['+', ['+']],
	['Mod+Very long label', ['⌘', 'Very long label']],
])('formats separate Mac keycaps without splitting their labels: %s', (shortcut, keys) => {
	expect(shortcutDisplayKeys(shortcut)).toEqual(keys)
})
