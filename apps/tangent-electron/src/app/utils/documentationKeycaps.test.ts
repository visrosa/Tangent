import { expect, it } from 'vitest'
import { wait } from '@such-n-such/core'
import { documentationKeycaps } from './documentationKeycaps'

it('limits explanations to installed documentation and follows preview edits', async () => {
	function preview() {
		const root = document.createElement('div')
		const host = document.createElement('t-keyboard')
		root.append(host)
		const shadow = host.attachShadow({ mode: 'open' })
		shadow.innerHTML = '<kbd class="keyboard-input-group"><kbd>⌃</kbd><kbd>C</kbd></kbd>'
		return { root, shadow }
	}
	const note = preview()
	expect(documentationKeycaps(note.root, false)).toBeUndefined()
	expect(note.shadow.querySelector('kbd kbd').hasAttribute('title')).toBe(false)
	const doc = preview()
	const action = documentationKeycaps(doc.root, true)
	try {
		expect(doc.shadow.querySelector('kbd kbd').getAttribute('title')).toBe('Control')
		expect(doc.shadow.querySelector('kbd').getAttribute('aria-label')).toBe('Control + C')
		expect(doc.shadow.querySelector('kbd kbd:last-child').hasAttribute('title')).toBe(false)
		doc.shadow.querySelector('kbd kbd').textContent = '⇧'
		await wait(20)
		expect(doc.shadow.querySelector('kbd kbd').getAttribute('title')).toBe('Shift')
	} finally { action.destroy() }
})
