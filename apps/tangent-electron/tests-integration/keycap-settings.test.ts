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
	const modifier = process.platform === 'darwin' ? '⌘' : '⌃'
	const shift = '⇧'
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
	await expect(copy.locator('.keyboard-display > kbd').first()).toHaveAttribute('title', process.platform === 'darwin' ? 'Command' : 'Control')
	await copy.locator('.bindingRow > button').first().focus()
	await expect(window.page.getByText(process.platform === 'darwin' ? 'Command + C' : 'Control + C', { exact: true })).toBeVisible()
	await expect(copy.locator('.bindingRow > button').first()).toHaveAccessibleName(process.platform === 'darwin' ? 'Command + C' : 'Control + C')
	for (const appearance of ['dark', 'light']) {
		await window.page.evaluate(appearance => (document as any).workspace.settings.appearance.set(appearance), appearance)
		await expect(window.page.locator('body')).toHaveClass(new RegExp(appearance))
		await menu.screenshot({ path: test.info().outputPath(`shortcut-keycaps-${appearance}.png`) })
	}
})

test('only installed documentation annotates note keycap previews', async ({ tangent }) => {
	const window = await tangent.firstWindow()
	expect(await window.page.evaluate(() => (document as any).workspace.isDocumentation)).toBe(false)
	const ordinary = await window.page.evaluate(() => {
		const preview = document.createElement('t-keyboard')
		preview.setAttribute('keyboard-data', JSON.stringify({ children: ['Ctrl'] }))
		document.querySelector('main.WorkspaceView').append(preview)
		return { label: preview.shadowRoot.textContent, title: preview.shadowRoot.querySelector('kbd').getAttribute('title') }
	})
	expect(ordinary).toEqual({ label: 'Ctrl', title: null })
	const opening = tangent.app.waitForEvent('window')
	await window.page.evaluate(() => (window as any).api.documentation.open('Backlinks'))
	const docs = await opening
	await docs.waitForSelector('main.WorkspaceView')
	await expect.poll(() => docs.evaluate(() => (document as any).workspace.isDocumentation)).toBe(true)
	await docs.evaluate(() => (document as any).workspace.navigateTo({ link: { href: 'Backlinks', form: 'wiki' } }))
	await expect(docs.locator(`t-keyboard kbd[title="${process.platform === 'darwin' ? 'Option' : 'Alt'}"]`).first()).toBeVisible()
	await expect(docs.locator('t-keyboard kbd[title="Down Arrow"]').first()).toBeVisible()
	expect(await docs.locator('t-keyboard').first().ariaSnapshot()).toContain(`Cmd/Ctrl + ${process.platform === 'darwin' ? 'Option' : 'Alt'} + Down Arrow`)
	expect(await docs.locator('.noteEditor article').first().textContent()).toContain('Cmd/Ctrl')
	await docs.screenshot({ path: test.info().outputPath('documentation-keycaps.png') })
})
