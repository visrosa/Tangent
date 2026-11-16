import { afterEach, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import { page } from 'vitest/browser'
import Setting from 'common/settings/Setting'
import SettingView from './SettingView.svelte'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup(settings: Setting<any, any>[]) {
	const target = document.createElement('div')
	document.body.append(target)
	const selectPath = vi.fn(async () => '/chosen')
	const components = settings.map(setting => mount(SettingView, {
		target,
		context: new Map([['workspace', { api: { file: { selectPath } } }]]),
		props: { setting }
	}))
	cleanups.push(async () => { for (const component of components) await unmount(component); target.remove() })
	await tick()
	return { target, selectPath }
}
it('gives each input its setting name and explanation with unique references', async () => {
	await setup([
		new Setting({ name: 'Font size', description: 'Size of note text', defaultValue: 16, range: { min: 8, max: 40 } }),
		new Setting({ name: 'Spell checking', description: 'Check spelling', defaultValue: true }),
		new Setting({ name: 'Theme', description: 'Choose appearance', defaultValue: 'dark', form: 'select', validValues: ['dark', 'light'] }),
		new Setting({ name: 'Template', description: 'Initial note content', defaultValue: '', form: 'textarea' }),
		new Setting({ name: 'Binding', description: 'Shortcut for action', defaultValue: 'Mod+N', form: 'shortcut' })
	])
	await expect.element(page.getByRole('spinbutton', { name: 'Font size' })).toHaveAccessibleDescription('Size of note text')
	await expect.element(page.getByRole('slider', { name: 'Font size' })).toHaveAccessibleDescription('Size of note text')
	await expect.element(page.getByRole('checkbox', { name: 'Spell checking' })).toHaveAccessibleDescription('Check spelling')
	await expect.element(page.getByRole('combobox', { name: 'Theme' })).toHaveAccessibleDescription('Choose appearance')
	await expect.element(page.getByRole('textbox', { name: 'Template' })).toHaveAccessibleDescription('Initial note content')
	await expect.element(page.getByRole('textbox', { name: 'Binding' })).toHaveAccessibleDescription('Shortcut for action')
})
it('identifies path/reset actions and preserves value changes', async () => {
	const setting = new Setting({ name: 'Assets folder', description: 'Where images are saved', defaultValue: '', form: 'folder' })
	const { selectPath } = await setup([setting])
	await page.getByRole('button', { name: 'Select Assets folder' }).click()
	expect(selectPath).toHaveBeenCalled()
	await expect.element(page.getByRole('textbox', { name: 'Assets folder' })).toHaveValue('/chosen')
	await page.getByRole('button', { name: 'Reset Assets folder to default' }).click()
	expect(setting.value).toBe('')
})
it('names collection controls without replacing individual option labels and exposes selected values', async () => {
	await setup([
		new Setting({ name: 'Details', description: 'Shown details', defaultValue: ['Words'], validValues: ['Words', 'Links'] }),
		new Setting({ name: 'Note margins', description: 'Spacing around notes', defaultValue: 'Small', validValues: ['Small', 'Large'] })
	])
	await expect.element(page.getByRole('group', { name: 'Note margins' })).toHaveAccessibleDescription('Spacing around notes')
	await expect.element(page.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true')
	await page.getByRole('button', { name: 'Large' }).click()
	await expect.element(page.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'false')
	await page.getByRole('button', { name: 'Details' }).click()
	await expect.element(page.getByRole('checkbox', { name: 'Words' })).toBeChecked()
	await expect.element(page.getByRole('checkbox', { name: 'Links' })).not.toBeChecked()
})
