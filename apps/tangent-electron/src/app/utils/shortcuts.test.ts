import { describe, expect, it } from 'vitest'
import { isMac } from 'common/platform'
import { shortcutsMatch, shortcutFromEvent } from './shortcuts'
import Command, { createCommandHandler } from 'app/model/commands/Command'

class Action extends Command {
	calls = 0
	execute() { this.calls++ }
}

describe('shifted bracket shortcuts', () => {
	it.each([['{', '[', 'BracketLeft'], ['}', ']', 'BracketRight']])('matches physical %s events and saved %s bindings', (key, binding, code) => {
		const event = new KeyboardEvent('keydown', { key, code, ctrlKey: !isMac, metaKey: isMac, shiftKey: true, cancelable: true })
		const action = new Action({ shortcut: `Mod+Shift+${binding}` })
		expect(shortcutFromEvent(event)).toBe(`Mod+Shift+${key}`)
		expect(createCommandHandler([action])(event)).toBe(true)
		expect(action.calls).toBe(1)
		expect(event.defaultPrevented).toBe(true)
		expect(shortcutsMatch(`Mod+Shift+${key}`, `Mod+Shift+${binding}`)).toBe(true)
	})
	it('preserves remapped brace aliases and distinguishes other chords', () => {
		expect(shortcutsMatch('Mod+Shift+{', 'Mod+Shift+[')).toBe(true)
		expect(shortcutsMatch('Mod+{', 'Mod+[')).toBe(false)
		expect(shortcutsMatch('Mod+Shift+{', 'Mod+Shift+]')).toBe(false)
		expect(shortcutsMatch('', '')).toBe(false)
	})
})
