import { describe, expect, test } from 'vitest'
import { wait } from '@such-n-such/core'
import { flushSync, mount, unmount } from 'svelte'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import LineGutterLeft from './LineGutterLeft.svelte'
import 'app/style/note.scss'

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

	test('places description-list chevrons in the gutter whatever their column', async () => {
		const wrapper = document.createElement('div')
		wrapper.style.position = 'relative'
		const article = document.createElement('article')
		article.classList.add('note')
		const root = document.createElement('div')
		article.appendChild(root)
		wrapper.appendChild(article)
		document.body.appendChild(wrapper)
		const editor = new MarkdownEditor(null, {
			doc: markdownToTextDocument('- term ::\n  - value\n    - regular nested item'),
			root
		})
		const lines = root.querySelectorAll('.line')

		const gutterLeft = async (index: number) => {
			const target = document.createElement('div')
			wrapper.appendChild(target)
			let component
			flushSync(() => {
				component = mount(LineGutterLeft, {
					target,
					props: { editor, target: { element: lines[index] as HTMLElement, index } }
				})
			})
			await wait(20)
			const left = (target.querySelector('div.left') as HTMLElement).style.left
			unmount(component)
			target.remove()
			return left
		}

		expect(lines[1].getBoundingClientRect().left).toBeGreaterThan(lines[0].getBoundingClientRect().left)
		expect(await gutterLeft(1)).toBe(await gutterLeft(0))
		wrapper.remove()
	})
})
