import { expect, it, vi } from 'vitest'
vi.mock('common/platform', () => ({ isMac: false }))
import { shortcutDisplayKeys } from './shortcuts'

it.each([
	['Mod+C', ['Ctrl', 'C']],
	['CommandOrControl+Shift+[', ['Ctrl', 'Shift', '[']],
	['Mod++', ['Ctrl', '+']],
	['Mod+Shift++', ['Ctrl', 'Shift', '+']],
	['Mod+-', ['Ctrl', '-']],
	['+', ['+']],
	['Space', ['Space']],
	['Mod+Very long label', ['Ctrl', 'Very long label']],
])('keeps shortcut keys separate without losing literal punctuation: %s', (shortcut, keys) => {
	expect(shortcutDisplayKeys(shortcut)).toEqual(keys)
})
