import { afterEach, describe, expect, it, vi } from 'vitest'
import TangentEmbed from './NoteEditor/t-embed'
import MarkdownEditor from './NoteEditor/MarkdownEditor'
import editorModule from './NoteEditor/editorModule'
import { TangentLink } from './NoteEditor/t-link'
import { getNodesForRange, type EditorRange } from 'typewriter-editor'

// Register the embed before MarkdownEditor evaluates its custom element imports.
void TangentEmbed

const editors: MarkdownEditor[] = []
function createEditor() {
	const root = document.body.appendChild(document.createElement('article'))
	root.style.whiteSpace = 'pre-wrap'
	const editor = new MarkdownEditor(null, { root, text: 'ABCDEFGHIJ' })
	editors.push(editor)
	return editor
}

function nativeSelect(editor: MarkdownEditor, selection: EditorRange = [5, 5]) {
	const [anchor, a, focus, f] = getNodesForRange(editor, selection)
	document.getSelection().setBaseAndExtent(anchor, a, focus, f)
}

function pasteEvent(text: string, image?: File) {
	const data = new DataTransfer()
	if (text) data.setData('text/plain', text)
	if (image) data.items.add(image)
	return new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
}

afterEach(() => {
	// Also release a navigation gesture whose editor was destroyed by a test.
	document.dispatchEvent(new MouseEvent('mouseup', { button: 1 }))
	for (const editor of editors.splice(0)) {
		if (!editor._root) continue
		const root = editor.root
		editor.destroy()
		root.remove()
	}
})

describe('PRIMARY paste integration', () => {
	it.each(([[0, 0], [0, 3], null] as EditorRange[]).map(selection => ({ selection })))(
		'uses the native range despite cached selection $selection', ({ selection }) => {
			const editor = createEditor()
			editor.select(selection)
			nativeSelect(editor)
			editor.root.dispatchEvent(pasteEvent('x\u00a0y\nz'))
			expect(editor.getText()).toBe('ABCDEx\u00a0y\nzFGHIJ')
			editor.commands.undo()
			expect(editor.getText()).toBe('ABCDEFGHIJ')
		}
	)

	it('suppresses release-time paste even after navigation destroys the editor', () => {
		const editor = createEditor()
		const root = editor.root
		const link = root.appendChild(document.createElement('t-link')) as TangentLink
		link.setAttribute('href', 'Target')
		link.setAttribute('form', 'wiki')
		const navigate = vi.fn(() => { editor.destroy(); root.remove() })
		editor.on('navigate', navigate)
		const down = new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true })
		link.dispatchEvent(down)
		expect(down.defaultPrevented).toBe(true)
		expect(navigate).toHaveBeenCalledTimes(1)
		const release = new MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true })
		document.body.dispatchEvent(release)
		expect(release.defaultPrevented).toBe(true)
		const next = new MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true })
		document.body.dispatchEvent(next)
		expect(next.defaultPrevented).toBe(false)
	})

	it('does not cancel ordinary middle-button text releases', () => {
		const editor = createEditor()
		const release = new MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true })
		editor.root.dispatchEvent(release)
		expect(release.defaultPrevented).toBe(false)
	})

	it('clears an abandoned navigation gesture on a new press', () => {
		const editor = createEditor()
		const link = editor.root.appendChild(document.createElement('t-link')) as TangentLink
		link.setAttribute('href', 'Target')
		link.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true, cancelable: true }))
		editor.root.dispatchEvent(new MouseEvent('mousedown', { button: 1, bubbles: true }))
		const release = new MouseEvent('mouseup', { button: 1, bubbles: true, cancelable: true })
		editor.root.dispatchEvent(release)
		expect(release.defaultPrevented).toBe(false)
	})

	it('hands image-event bytes and the captured range to the image hook', async () => {
		const editor = createEditor()
		const saveImageFromPaste = vi.fn(async () => '/workspace/image.png')
		const workspace = {
			settings: {
				rawLinksAutoEmbed: { value: false },
				allowInterTextUnderscoreFormatting: { value: false },
				allowUnknownHTMLTags: { value: false }
			},
			api: { system: { saveImageFromPaste } },
			getHandle: () => ({ subscribe: callback => { callback({ path: '/workspace/image.png' }); return () => {} } }),
			directoryStore: { getPathToItem: () => 'image.png' }
		}
		const hook = editorModule(editor, { workspace: workspace as any })
		editor.modules.paste.destroy()
		editor.modules.tangent.destroy()
		hook.init()
		editor.modules.tangent = hook
		editor.modules.paste.init()
		editor.select([0, 3])
		nativeSelect(editor)
		const bytes = new Uint8Array([1, 2, 3, 4])
		editor.root.dispatchEvent(pasteEvent('', new File([bytes], 'event.png', { type: 'image/png' })))
		await vi.waitFor(() => expect(saveImageFromPaste).toHaveBeenCalledWith('', bytes))
		await vi.waitFor(() => expect(editor.getText()).toBe('ABCDE![[image.png]]FGHIJ'))
	})
})
