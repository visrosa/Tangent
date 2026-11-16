import { test, expect, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Native PRIMARY transfer requires a private X11 display and xdotool.
test.skip(process.platform !== 'linux' || process.env.TANGENT_TEST_PRIMARY !== '1',
	'Run on a private X11 display with TANGENT_TEST_PRIMARY=1')

let app: ElectronApplication
let page: Page
let fixture: string
const body = '.current .noteEditor article'
const title = '.current .noteEditor header .title'

test.beforeAll(async () => {
	fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'tangent-primary-'))
	const workspace = path.join(fixture, 'workspace')
	await fs.mkdir(path.join(workspace, '.tangent'), { recursive: true })
	await fs.writeFile(path.join(workspace, 'Paste.md'), 'ABCDEFGHIJ')
	await fs.writeFile(path.join(workspace, 'Target.md'), 'TARGET_BODY')
	await fs.writeFile(path.join(workspace, 'Receiver.md'), 'ABCDEFGHIJ')
	const appRoot = process.cwd()
	const bootstrap = path.join(fixture, 'bootstrap.cjs')
	// Normalize away Playwright's injected debugger arguments before app parsing.
	await fs.writeFile(bootstrap, `
const { app } = require('electron')
app.setAppPath(${JSON.stringify(appRoot)})
process.argv = [process.execPath, ${JSON.stringify(appRoot)}, ${JSON.stringify(workspace)}]
import(${JSON.stringify(path.join(appRoot, '__build/main/main.mjs'))})
`)
	const env = { ...process.env, INTEGRATION_TEST: '1', WORKSPACE_NAME: 'primary_' }
	delete env.ELECTRON_RUN_AS_NODE
	delete env.WAYLAND_DISPLAY
	delete env.WAYLAND_SOCKET
	app = await _electron.launch({
		executablePath: require('electron'),
		args: [bootstrap, '--ozone-platform=x11', `--user-data-dir=${path.join(fixture, 'profile')}`],
		env
	})
	page = await app.firstWindow()
	await app.evaluate(({ BrowserWindow }) => {
		const window = BrowserWindow.getAllWindows()[0]
		window.setBounds({ x: 0, y: 0, width: 1100, height: 800 })
		window.focus()
	})
	page.on('pageerror', error => console.error('Renderer error:', error.message))
	page.on('console', message => { if (message.type() === 'error') console.error('Renderer:', message.text()) })
	await page.waitForSelector('main.WorkspaceView')
	await page.evaluate(() => (document as any).workspace.navigateTo({ link: { href: 'Paste', form: 'wiki' } }))
	await page.locator(body).waitFor()
	await page.evaluate(() => document.fonts.ready)
	console.log(await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome })))
})

test.afterAll(async () => {
	if (app) {
		const timeout = setTimeout(() => app.process().kill(), 5000)
		try { await app.close() } finally { clearTimeout(timeout) }
	}
	if (fixture) await fs.rm(fixture, { recursive: true, force: true })
})

async function setBuffers(primary = 'PRIMARY', clipboard = 'CLIPBOARD') {
	await app.evaluate(async ({ clipboard: buffers }, values) => {
		await buffers.writeText(values.clipboard)
		await buffers.selection.writeText(values.primary)
	}, { primary, clipboard })
}

async function text(selector = body) {
	return page.locator(selector).evaluate((root: any) => root.editor.getText())
}

async function prepare(selector = body, selection: [number, number] | null = [0, 0], value = 'ABCDEFGHIJ', at = 5) {
	if (selector === body) {
		await page.evaluate(value => {
			const workspace = (document as any).workspace
			workspace.viewState.tangent.currentNode.value.setFileContent(value)
		}, value)
		await expect.poll(() => text()).toBe(value)
	}
	await page.locator(selector).evaluate((root: any, { value, selection }) => {
		const editor = root.editor
		if (root.tagName === 'SPAN') editor.setText(value, selection)
		else editor.select(selection)
		if (!selection) root.blur()
	}, { value, selection })
	// Avoid interpreting successive trials as a multi-click selection gesture.
	await page.waitForTimeout(500)
	await expect.poll(() => text(selector)).toBe(value)
	return page.locator(selector).evaluate((root: any, at) => {
		const bounds = root.editor.getBounds([at, at])
		return { x: bounds.left + 1, y: (bounds.top + bounds.bottom) / 2 }
	}, at)
}

async function middleClick(point: { x: number, y: number }) {
	const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
	execFileSync('xdotool', ['mousemove', '--sync', String(Math.round(bounds.x + point.x)),
		String(Math.round(bounds.y + point.y)), 'click', '2'])
}

for (const selection of [[0, 0], [0, 3], null] as ([number, number] | null)[]) {
	test(`native note insertion with previous range ${JSON.stringify(selection)}`, async () => {
		const point = await prepare(body, selection)
		const primary = 'x\u00a0y\nz'
		await setBuffers(primary)
		await middleClick(point)
		await expect.poll(() => text()).toBe(`ABCDE${primary}FGHIJ`)
		await page.locator(body).evaluate((root: any) => root.editor.commands.undo())
		await expect.poll(() => text()).toBe('ABCDEFGHIJ')
		await page.locator(body).evaluate((root: any) => root.editor.commands.redo())
		await expect.poll(() => text()).toBe(`ABCDE${primary}FGHIJ`)
		expect(await app.evaluate(async ({ clipboard }) => ({
			primary: await clipboard.selection.readText(), clipboard: await clipboard.readText()
		}))).toEqual({ primary, clipboard: 'CLIPBOARD' })
	})
}

test('empty note and repeated native pastes', async () => {
	const point = await prepare(body, null, '', 0)
	await setBuffers()
	await middleClick(point)
	await expect.poll(() => text()).toBe('PRIMARY')
	await page.waitForTimeout(500)
	await middleClick(point)
	await expect.poll(() => text()).toBe('PRIMARYPRIMARY')
})

test('ordinary paste still replaces the selected source range', async () => {
	await prepare(body, [0, 3])
	await setBuffers()
	await page.keyboard.press('Control+v')
	await expect.poll(() => text()).toBe('CLIPBOARDDEFGHIJ')
})

test('native filename insertion uses the clicked range', async () => {
	const point = await prepare(title, [0, 3])
	await setBuffers()
	await middleClick(point)
	await expect.poll(() => text(title)).toBe('ABCDEPRIMARYFGHIJ')
})

test('text PRIMARY does not import an image from ordinary CLIPBOARD', async () => {
	const point = await prepare()
	const types = await app.evaluate(async ({ clipboard, nativeImage, ClipboardItem }) => {
		const image = nativeImage.createFromBitmap(Buffer.from([0, 128, 255, 255]), { width: 1, height: 1 })
		await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
		await clipboard.selection.writeText('TEXT_PRIMARY')
		return (await clipboard.read()).flatMap(item => item.types)
	})
	expect(types).toContain('image/png')
	await middleClick(point)
	await expect.poll(() => text()).toBe('ABCDETEXT_PRIMARYFGHIJ')
})

test('ordinary image paste saves the event image through the bridge', async () => {
	await prepare(body, [5, 5])
	const types = await app.evaluate(async ({ clipboard, nativeImage, ClipboardItem }) => {
		const image = nativeImage.createFromBitmap(Buffer.from([0, 128, 255, 255]), { width: 1, height: 1 })
		await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
		return (await clipboard.read()).flatMap(item => item.types)
	})
	expect(types).toContain('image/png')
	await page.keyboard.press('Control+v')
	await expect.poll(() => text()).toMatch(/^ABCDE!\[\[.+\.png\]\]FGHIJ$/)
})

test('selected Tangent source owns PRIMARY and can paste into the same editor', async () => {
	await prepare()
	await setBuffers('PREVIOUS_PRIMARY')
	const points = await page.locator(body).evaluate((root: any) => [1, 4, 9].map(at => {
		const rect = root.editor.getBounds([at, at])
		return { x: rect.left, y: (rect.top + rect.bottom) / 2 }
	}))
	const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
	const coords = (point: { x: number, y: number }) => [String(Math.round(bounds.x + point.x)), String(Math.round(bounds.y + point.y))]
	execFileSync('xdotool', ['mousemove', '--sync', ...coords(points[0]), 'mousedown', '1',
		'mousemove', '--sync', ...coords(points[1]), 'sleep', '0.2', 'mouseup', '1'])
	await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.selection.readText())).toBe('BCD')
	await page.waitForTimeout(500)
	await middleClick(points[2])
	await expect.poll(() => text()).toBe('ABCDEFGHIBCDJ')
	expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('CLIPBOARD')
})

test('middle-button link navigation does not also paste', async () => {
	await prepare(body, [0, 0], '[[Target]]', 0)
	const link = page.locator(body).locator('t-link').first()
	await expect(link).toBeVisible()
	const rect = await link.boundingBox()
	await setBuffers()
	await middleClick({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
	await expect.poll(() => text()).toBe('TARGET_BODY')
	const allText = await page.locator('.noteEditor article').evaluateAll(roots => roots.map((root: any) => root.editor.getText()))
	expect(allText.every(value => !value.includes('PRIMARY'))).toBe(true)
})

test('source selected in one note can paste into another without Copy', async () => {
	await prepare()
	await setBuffers('PREVIOUS_PRIMARY')
	const points = await page.locator(body).evaluate((root: any) => [1, 4].map(at => {
		const rect = root.editor.getBounds([at, at])
		return { x: rect.left, y: (rect.top + rect.bottom) / 2 }
	}))
	const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
	const coords = (point: { x: number, y: number }) => [String(Math.round(bounds.x + point.x)), String(Math.round(bounds.y + point.y))]
	execFileSync('xdotool', ['mousemove', '--sync', ...coords(points[0]), 'mousedown', '1',
		'mousemove', '--sync', ...coords(points[1]), 'sleep', '0.2', 'mouseup', '1'])
	await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.selection.readText())).toBe('BCD')
	await page.evaluate(() => (document as any).workspace.navigateTo({ link: { href: 'Receiver', form: 'wiki' } }))
	await expect.poll(() => text()).toBe('ABCDEFGHIJ')
	const point = await prepare()
	await middleClick(point)
	await expect.poll(() => text()).toBe('ABCDEBCDFGHIJ')
	expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('CLIPBOARD')
})
