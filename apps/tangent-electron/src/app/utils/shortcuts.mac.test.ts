import { expect, it, vi } from 'vitest'
vi.mock('common/platform', () => ({ isMac: true }))
import { shortcutDisplayString } from './shortcuts'

it('keeps a literal plus key in Mac shortcut labels', () => {
	expect(shortcutDisplayString('Mod++')).toBe('⌘ +')
	expect(shortcutDisplayString('+')).toBe('+')
	expect(shortcutDisplayString('Mod+Shift+[')).toBe('⌘ ⇧ [')
})
