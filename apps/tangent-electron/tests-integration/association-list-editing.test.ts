import { test, expect } from './tangent'
import fs from 'fs/promises'
import path from 'path'

for (const focus of [0, 1, 2]) {
	test(`Association List source flow retains a distant caret in focus level ${focus}`, async ({ tangent, workspace }) => {
		const window = await tangent.firstWindow()
		const source = '# Catalog\n\n- Group ::\n' + Array.from({ length: 120 }, (_, index) =>
			`  - Item ${String(index).padStart(3, '0')} :: A value for this entry.`).join('\n') + '\n\nAfter'
		const filepath = path.join(workspace, 'Association List editing.md')
		await fs.writeFile(filepath, source)
		await window.page.waitForFunction(filepath => !!(document as any).workspace.directoryStore.get(filepath), filepath)
		await window.createAndOpenFileNamed('Association List editing')
		await window.setFocusLevel(focus)
		const note = window.page.locator('.current .noteEditor')
		await note.locator('.editor-association-list').waitFor()
		await window.page.evaluate(() => {
			const tangent = (document as any).workspace.viewState.tangent
			tangent.context.getState(tangent.currentNode.value).editor.select(null)
		})
		const term = note.locator('.association-list-term-content').filter({ hasText: 'Item 080' })
		await term.scrollIntoViewIfNeeded()
		await term.click()
		await expect(note.locator('.association-list-editing')).toBeVisible()
		await expect.poll(async () => window.page.evaluate(() => {
			const tangent = (document as any).workspace.viewState.tangent
			const editor = tangent.context.getState(tangent.currentNode.value).editor
			const caret = editor.getBounds(editor.doc.selection[1])
			const panel = editor.root.closest('.noteEditor').getBoundingClientRect()
			return caret.top >= panel.top && caret.bottom <= panel.bottom
		})).toBe(true)
		await window.keyboard.press('End')
		await window.keyboard.press('ArrowDown')
		await expect.poll(async () => window.page.evaluate(() => {
			const tangent = (document as any).workspace.viewState.tangent
			const editor = tangent.context.getState(tangent.currentNode.value).editor
			const line = editor.doc.getLineAt(editor.doc.selection[1])
			return editor.doc.getText(editor.doc.getLineRange(line))
		})).toContain('Item 081')
		expect(await window.getCurrentEditorText()).toBe(source)
	})
}
