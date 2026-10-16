import { expect, it } from 'vitest'
import { mount, unmount, tick } from 'svelte'
import { wait } from '@such-n-such/core'
import PlatformShortcut from './PlatformShortcut.svelte'
import { dropAllTooltips, tooltips } from 'app/utils/tooltips'
import '../../../static/global.css'

it('explains individual Settings keys and the focused binding without changing the stored shortcut', async () => {
	const button = document.createElement('button')
	document.body.append(button)
	const component = mount(PlatformShortcut, { target: button, props: { shortcut: 'Ctrl+Shift++' } })
	await tick()
	try {
		const caps = button.querySelectorAll('kbd kbd')
		expect(Array.from(caps).map(cap => cap.textContent)).toEqual(['⌃', '⇧', '+'])
		expect(Array.from(caps).map(cap => cap.getAttribute('title'))).toEqual(['Control', 'Shift', 'Plus'])
		expect(button.querySelector('kbd').getAttribute('aria-label')).toBe('Control + Shift + Plus')
		button.focus()
		await wait(1100)
		expect(tooltips.value.at(-1)?.config.tooltip).toBe('Control + Shift + Plus')
		button.blur()
		expect(tooltips.value).toHaveLength(0)
	} finally { dropAllTooltips(); await unmount(component); button.remove() }
})
