import { describe, expect, test } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import LineGutterLeft from './LineGutterLeft.svelte'

describe('LineGutterLeft', () => {
	test('does not move editor focus on collapse-button mouse down', () => {
		const root = document.createElement('div')
		const editor = new MarkdownEditor(null, {
			doc: markdownToTextDocument('- term ::\n  - description'),
			root
		})
		const target = document.createElement('div')
		document.body.appendChild(target)

		let component
		flushSync(() => {
			component = mount(LineGutterLeft, {
				target,
				props: {
					editor,
					target: {
						element: root.querySelector('.line') as HTMLElement,
						index: 0
					}
				}
			})
		})

		const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
		const accepted = target.querySelector('button').dispatchEvent(event)

		expect(accepted).toBe(false)
		expect(event.defaultPrevented).toBe(true)

		unmount(component)
		target.remove()
	})
})
