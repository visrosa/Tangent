import { test, expect } from './tangent'

test('shortcut keycaps retain capture, removal and reset', async ({ tangent }) => {
	const window = await tangent.firstWindow()
	await window.page.evaluate(() => {
		const system = (document as any).workspace.viewState.system
		system.section.set('Shortcuts')
		system.showMenu.set(true)
	})
	const menu = window.page.locator('.SystemMenu')
	await menu.locator('input[type="search"]').fill('Go Back')
	const row = menu.locator('tr').filter({ hasText: 'Go Back' })
	const modifier = process.platform === 'darwin' ? '⌘' : 'Ctrl'
	const shift = process.platform === 'darwin' ? '⇧' : 'Shift'
	await expect(row.locator('.keyboard-display > kbd')).toHaveText([modifier, shift, '['])
	await row.locator('.bindingRow button').first().click()
	await window.shortcut('Mod+Alt+B')
	const bindings = () => window.page.evaluate(() => (document as any).workspace.commands.shiftHistoryBack.shortcuts)
	await expect.poll(bindings).toEqual(['Mod+Alt+B'])
	await row.locator('.bindingRow').hover()
	await row.locator('button.remove').click()
	await expect.poll(bindings).toEqual([])
	await expect(row.locator('kbd')).toHaveCount(0)
	await row.locator('td').last().locator('button').click()
	await expect.poll(bindings).toEqual(['Mod+Shift+['])
	await expect(row.locator('.keyboard-display > kbd')).toHaveText([modifier, shift, '['])
	await menu.locator('input[type="search"]').fill('Copy')
	const copy = menu.locator('tr').filter({ has: window.page.getByText('Copy', { exact: true }) })
	await expect(copy.locator('.keyboard-display > kbd')).toHaveText([modifier, 'C'])
	await expect(copy.locator('.bindingRow > button').first()).toHaveAccessibleName(process.platform === 'darwin' ? '⌘ C' : 'Ctrl+C')
	for (const appearance of ['dark', 'light']) {
		await window.page.evaluate(appearance => (document as any).workspace.settings.appearance.set(appearance), appearance)
		await expect(window.page.locator('body')).toHaveClass(new RegExp(appearance))
		await menu.screenshot({ path: test.info().outputPath(`shortcut-keycaps-${appearance}.png`) })
	}
})
