import { expect, it } from 'vitest'
import { keyPresentation, shortcutPresentation } from './keyboardKeys.mjs'

it.each(['darwin', 'win32', 'linux'])('keeps key identity and accessible names while displaying compact %s shortcuts', platform => {
	const copy = shortcutPresentation('Mod+C', platform)
	expect(copy.map(key => key.label)).toEqual([platform === 'darwin' ? '⌘' : '⌃', 'C'])
	expect(copy.map(key => key.name)).toEqual([platform === 'darwin' ? 'Command' : 'Control', 'C'])
	expect(copy[1].tooltip).toBeUndefined()
	expect(shortcutPresentation('Mod++', platform).at(-1)).toEqual({ label: '+', name: 'Plus', tooltip: 'Plus' })
	for (const key of ['Control', 'Alt', 'Shift', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'CapsLock', 'Space', 'Up', 'Down', 'Left', 'Right', '[', ']', '/', '\\']) {
		const presentation = keyPresentation(key, platform)
		expect(Array.from(presentation.label)).toHaveLength(1)
		expect(presentation.tooltip).toBe(presentation.name)
	}
	expect(keyPresentation('Alt', platform).name).toBe(platform === 'darwin' ? 'Option' : 'Alt')
	expect(keyPresentation('Meta', platform).name).toBe(platform === 'darwin' ? 'Command' : platform === 'win32' ? 'Windows' : 'Super')
	expect(keyPresentation('Very long label', platform).label).toBe('Very long label')
	expect(keyPresentation('F12', platform)).toEqual({ label: 'F12', name: 'Function 12', tooltip: 'Function 12' })
	expect(keyPresentation('é', platform).tooltip).toBeUndefined()
})
