import { afterEach, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import { page, userEvent } from 'vitest/browser'
import MessageToast from './MessageToast.svelte'
import type WindowAPI from 'common/WindowApi'
import type { UserMessage } from 'common/WindowApi'

let cleanup: () => Promise<void>
afterEach(async () => { await cleanup?.(); cleanup = null; vi.useRealTimers() })
async function setup() {
	let send: (message: UserMessage) => void
	const target = document.createElement('div')
	document.body.append(target)
	const component = mount(MessageToast, { target, props: { api: { onMessage: callback => { send = callback } } as WindowAPI } })
	await tick()
	cleanup = async () => { await unmount(component); target.remove() }
	return { target, send }
}
it('exposes message urgency without taking focus and keeps dismissal visible and keyboard reachable', async () => {
	const { target, send } = await setup()
	const source = document.createElement('button')
	document.body.append(source)
	try {
		source.focus()
		send({ type: 'error', title: 'Save failed', message: 'Keep the editor open.' })
		await tick()
		expect(document.activeElement).toBe(source)
		await expect.element(page.getByRole('alert')).toHaveTextContent('Save failed')
		const close = target.querySelector('button')
		expect(getComputedStyle(close).opacity).toBe('1')
		close.focus()
		await userEvent.keyboard('{Enter}')
		await vi.waitFor(() => expect(target.querySelectorAll('article')).toHaveLength(0))
	} finally { source.remove() }
})
it('retains focused and hovered notifications and never expires errors', async () => {
	const { target, send } = await setup()
	vi.useFakeTimers()
	send({ type: 'info', message: 'Operation finished' })
	send({ type: 'error', message: 'Operation failed' })
	await tick()
	const article = target.querySelector('article')
	const close = article.querySelector('button')
	close.focus()
	await vi.advanceTimersByTimeAsync(20000)
	expect(target.querySelectorAll('article')).toHaveLength(2)
	article.dispatchEvent(new MouseEvent('mouseenter'))
	close.blur()
	await vi.advanceTimersByTimeAsync(3000)
	expect(target.querySelectorAll('article')).toHaveLength(2)
	article.dispatchEvent(new MouseEvent('mouseleave'))
	await vi.advanceTimersByTimeAsync(2500)
	await tick()
	// Outgoing transitions may still be present until the next real animation frame.
	vi.useRealTimers()
	await vi.waitFor(() => expect(target.querySelectorAll('article')).toHaveLength(1))
	expect(target.querySelector('article').classList.contains('error')).toBe(true)
})
it('clears expiry timers on teardown and ignores late messages', async () => {
	const { send } = await setup()
	vi.useFakeTimers()
	send({ type: 'info', message: 'Finished' })
	await tick()
	expect(vi.getTimerCount()).toBeGreaterThan(0)
	await cleanup()
	cleanup = null
	expect(vi.getTimerCount()).toBe(0)
	send({ type: 'info', message: 'Late message' })
	expect(vi.getTimerCount()).toBe(0)
})
