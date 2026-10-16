import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import commandAction from './CommandAction'
import Command from './Command'
import { dropAllTooltips, tooltips } from 'app/utils/tooltips'

class TestCommand extends Command {
	label = 'Show sidebar'
	checked: boolean | null = null
	available = true
	execute = vi.fn()
	getLabel() { return this.label }
	getTooltip() { return 'Show or hide workspace navigation' }
	getChecked() { return this.checked }
	canExecute() { return this.available }
	refresh() { this.alertDirty() }
}
const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); dropAllTooltips(); vi.useRealTimers() })
function setup(markup = '<svg aria-hidden="true"></svg>', attributes: Record<string, string> = {}) {
	const node = document.createElement('button')
	node.innerHTML = markup
	for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
	document.body.append(node)
	const command = new TestCommand()
	const action = commandAction(node, command)
	cleanups.push(() => { action.destroy(); node.remove() })
	return { node, command, action }
}
it('names icon commands and exposes changing toggle/availability state without changing native activation', async () => {
	const { node, command } = setup()
	expect(node.getAttribute('aria-label')).toBe('Show sidebar')
	expect(node.hasAttribute('aria-pressed')).toBe(false)
	command.checked = false
	command.refresh()
	await vi.waitFor(() => expect(node.getAttribute('aria-pressed')).toBe('false'))
	node.focus()
	await userEvent.keyboard('{Enter}')
	await userEvent.keyboard(' ')
	expect(command.execute).toHaveBeenCalledTimes(2)
	command.checked = true
	command.label = 'Hide sidebar'
	command.available = false
	command.refresh()
	await vi.waitFor(() => expect(node.disabled).toBe(true))
	expect(node.getAttribute('aria-pressed')).toBe('true')
	expect(node.getAttribute('checked')).toBe('true')
	expect(node.getAttribute('aria-label')).toBe('Hide sidebar')
	command.checked = null
	command.refresh()
	await vi.waitFor(() => expect(node.hasAttribute('aria-pressed')).toBe(false))
})
it('preserves visible names, explicit names and expanded-state ownership', () => {
	for (const attrs of [{ 'aria-label': 'Custom action' }, { 'aria-labelledby': 'custom-name' }, { 'aria-expanded': 'false' }]) {
		const { node, command, action } = setup('<svg></svg>', attrs)
		command.checked = true
		action.update(command)
		for (const [key, value] of Object.entries(attrs)) expect(node.getAttribute(key)).toBe(value)
		if ('aria-expanded' in attrs) expect(node.hasAttribute('aria-pressed')).toBe(false)
	}
	const { node } = setup('Visible action')
	expect(node.hasAttribute('aria-label')).toBe(false)
	expect(node.textContent).toBe('Visible action')
})
it('exposes checked menu items without misrepresenting them as toggle buttons', () => {
	const { node, command, action } = setup('Choose view', { role: 'menuitemradio' })
	command.checked = false
	action.update(command)
	expect(node.getAttribute('aria-checked')).toBe('false')
	expect(node.hasAttribute('aria-pressed')).toBe(false)
})
it('offers help on keyboard focus and dismisses it on Escape and teardown', async () => {
	const { node, action } = setup()
	vi.useFakeTimers()
	node.focus()
	await vi.advanceTimersByTimeAsync(1100)
	expect(tooltips.value[0]?.origin).toBe(node)
	node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	expect(tooltips.value).toHaveLength(0)
	node.blur()
	node.focus()
	action.destroy()
	await vi.advanceTimersByTimeAsync(1100)
	expect(tooltips.value).toHaveLength(0)
})

it('leaves commands without help focusable without requesting an empty tooltip', async () => {
	const { node, command } = setup()
	command.getTooltip = () => null
	node.focus()
	node.dispatchEvent(new MouseEvent('mouseenter'))
	expect(tooltips.value).toHaveLength(0)
})
