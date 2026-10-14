import { afterEach, describe, expect, it } from 'vitest'
import { wait } from '@such-n-such/core'
import { Editor, docToHTML, inlineToHTML, deltaFromDom, getBrowserRange, getIndexFromNodeAndOffset } from 'typewriter-editor'
import { Delta } from '@typewriter/delta'
import { markdownToTextDocument, parseMarkdown } from 'common/markdownModel/parser'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import { typewriterToText } from 'common/typewriterUtils'
import { TextDocument } from '@typewriter/document'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import { revealContentAroundRange } from './editorModule'
import './t-keyboard'

const editors: Editor[] = []

function makeEditor(source: string, markdown = false) {
	const root = document.createElement('div')
	root.style.whiteSpace = 'pre-wrap'
	document.body.appendChild(root)
	const editor = markdown ? new MarkdownEditor(null) : new Editor({ types: noteTypeset })
	editor.setRoot(root)
	editor.set(markdownToTextDocument(source))
	editors.push(editor)
	return editor
}

function preview(editor: Editor) {
	return editor.root.querySelector('t-keyboard').shadowRoot
}

afterEach(() => {
	for (const editor of editors.splice(0)) {
		const root = editor.root
		editor.destroy()
		root.remove()
	}
})

describe('keyboard input rendering', () => {
	it.each([
		'[+[+⎇+][+N+]+]', '[-[-⎇-][-N-]-]', '[+[-⎇-][+N+]+]',
		'⁅⹕⎇⹖⹕N⹖⁆', '⹕⁅⎇⁆[-N-]⹖', '[+⹕⎇⹖⁅N⁆+]',
	])('selects brackets by depth for %s', source => {
		const editor = makeEditor(source)
		expect(preview(editor).textContent).toBe('⁅⹕⎇⹖⹕N⹖⁆')
		expect(preview(editor).querySelectorAll('kbd')).toHaveLength(3)
		expect(editor.root.textContent).toBe(source)
	})

	it('preserves Unicode source through reveal, DOM reconstruction and caret mapping', () => {
		const source = 'Before ⁅⹕👩‍💻⹖[+N+]⁆⹕M⹖ after'
		const editor = makeEditor(source)
		const change = editor.doc.change
		const offset = source.indexOf('👩')
		revealContentAroundRange(editor.doc, [offset, offset], change)
		editor.set(editor.doc.apply(change))
		expect(editor.root.querySelector('.keyboard-source').textContent).toBe('⁅⹕👩‍💻⹖[+N+]⁆')
		const delta = deltaFromDom(editor, { root: editor.root, collapseWhitespace: false })
		expect(typewriterToText(new TextDocument(delta))).toBe(source)
		for (const offset of [0, source.indexOf('after'), source.length]) {
			const range = getBrowserRange(editor, [offset, offset])
			expect(getIndexFromNodeAndOffset(editor, range.startContainer, range.startOffset)).toBe(offset)
		}
	})

	it('rerenders after substituting delimiters individually and undoing', async () => {
		const editor = makeEditor('Before [+N+] after', true) as MarkdownEditor
		editor.select(0)
		const start = editor.getText().indexOf('[+')
		editor.change.delete([start, start + 2]).insert(start, '⁅').apply()
		await wait(20)
		expect(editor.root.querySelector('t-keyboard')).toBeNull()
		const close = editor.getText().indexOf('+]')
		editor.change.delete([close, close + 2]).insert(close, '⁆').apply()
		await wait(20)
		expect(preview(editor).textContent).toBe('⁅N⁆')
		editor.modules.history.undo()
		await wait(20)
		expect(editor.getText()).toBe('Before ⁅N+] after')
		expect(editor.root.querySelector('t-keyboard')).toBeNull()
		editor.modules.history.undo()
		await wait(20)
		expect(editor.getText()).toBe('Before [+N+] after')
		expect(preview(editor).textContent).toBe('⁅N⁆')
	})

	it('keeps adjacent outer spans separate and uses quills at every inner depth', () => {
		const editor = makeEditor('[+N+][-N-][+[-[+A+]-]+]')
		const outputs = Array.from(editor.root.querySelectorAll('t-keyboard'))
		expect(outputs.map(el => el.shadowRoot.textContent)).toEqual(['⁅N⁆', '⁅N⁆', '⁅⹕⹕A⹖⹖⁆'])
	})

	it('keeps literal markup safe and preserves label whitespace and Unicode', () => {
		const source = '[+<img src=x onerror=alert(1)> **N**  👩‍💻 e\u0301+]'
		const editor = makeEditor(source)
		expect(preview(editor).textContent).toBe('⁅<img src=x onerror=alert(1)> **N**  👩‍💻 e\u0301⁆')
		expect(preview(editor).querySelector('img')).toBeNull()
	})

	it('updates preview content during live edits and undo', async () => {
		const editor = makeEditor('Before [+[-N-]+] after', true) as MarkdownEditor
		editor.select(0)
		const index = editor.getText().indexOf('N')
		editor.change.delete([index, index + 1]).insert(index, 'M').apply()
		await wait(20)
		expect(preview(editor).textContent).toBe('⁅⹕M⹖⁆')
		editor.modules.history.undo()
		await wait(20)
		expect(preview(editor).textContent).toBe('⁅⹕N⹖⁆')
		expect(editor.getText()).toBe('Before [+[-N-]+] after')
	})

	it('reconstructs exact source from the editor DOM without reading the preview', () => {
		const source = 'Before [+[-⎇-][+👩‍💻+]+][-N-] after'
		const editor = makeEditor(source)
		const delta = deltaFromDom(editor, { root: editor.root, collapseWhitespace: false })
		expect(typewriterToText(new TextDocument(delta))).toBe(source)
	})

	it('maps caret offsets around adjacent previews to the original source', () => {
		const source = '[+[-👩‍💻-]+][+N+] after'
		const editor = makeEditor(source)
		for (const offset of [0, source.indexOf('after'), source.length]) {
			const range = getBrowserRange(editor, [offset, offset])
			expect(getIndexFromNodeAndOffset(editor, range.startContainer, range.startOffset)).toBe(offset)
		}
	})

	it('reveals only the selected source instance and retains its preview', () => {
		const editor = makeEditor('[+N+] text [+N+]')
		const change = editor.doc.change
		revealContentAroundRange(editor.doc, [2, 2], change)
		editor.set(editor.doc.apply(change))
		const containers = Array.from(editor.root.querySelectorAll('.inline-keyboard-container'))
		expect(containers.map(el => el.classList.contains('revealed'))).toEqual([true, false])
		expect(containers[0].querySelector('.keyboard-source').textContent).toBe('[+N+]')
		expect(containers[0].querySelector('t-keyboard').shadowRoot.textContent).toBe('⁅N⁆')
	})

	it.each(['click', 'dblclick', 'mousedown', 'contextmenu'])('%s on a nested key requests the exact source group', eventType => {
		const editor = makeEditor('[+[-⎇-][+N+]+][+N+]')
		const output = editor.root.querySelector('t-keyboard')
		let captured: any
		output.addEventListener(eventType, event => { captured = (event as any).editorSelectionRequest })
		output.shadowRoot.querySelector('kbd kbd').dispatchEvent(new MouseEvent(eventType, { bubbles: true, composed: true }))
		expect(captured.inline(editor.doc.lines[0].content.ops[0].attributes)).toBe(true)
		expect(captured.inline(editor.doc.lines[0].content.ops[1].attributes)).toBe(false)
	})

	it('does not duplicate a preview when decorations split an instance', () => {
		const source = '[+[-⎇-][+N+]+]'
		const op = parseMarkdown(source).lines[0].content.ops[0]
		const delta = new Delta([
			{ insert: source.slice(0, 7), attributes: { ...op.attributes, decoration: { focus: { class: 'unfocused' } } } },
			{ insert: source.slice(7), attributes: op.attributes },
			{ insert: '\n' }
		])
		const editor = makeEditor('')
		editor.set(new TextDocument(delta))
		expect(editor.root.querySelectorAll('t-keyboard')).toHaveLength(1)
		expect(preview(editor).textContent).toBe('⁅⹕⎇⹖⹕N⹖⁆')
	})

	it.each([
		'[+[-⎇-][+N+]+]', '# [+[-⎇-][+N+]+]', '- [+[-⎇-][+N+]+]', '> [+[-⎇-][+N+]+]',
		'⁅⹕⎇⹖⹕N⹖⁆', '⹕⁅⎇⁆[+N+]⹖',
	])('exports nested semantic HTML from %s', source => {
		const editor = makeEditor(source)
		const exported = document.createElement('div')
		exported.innerHTML = docToHTML(editor, editor.doc)
		expect(exported.querySelectorAll('kbd')).toHaveLength(3)
		expect(exported.querySelector('kbd').textContent).toBe('⎇N')
		expect(exported.querySelectorAll('kbd > kbd')).toHaveLength(2)
		expect(exported.querySelector('t-keyboard')).toBeNull()
		expect(exported.querySelector('.keyboard-source')).toBeNull()
	})

	it('inline HTML export preserves distinct adjacent outer inputs', () => {
		const editor = makeEditor('[+N+][+N+]')
		const exported = document.createElement('div')
		exported.innerHTML = inlineToHTML(editor, editor.doc.lines[0].content)
		expect(Array.from(exported.children).map(el => el.textContent)).toEqual(['N', 'N'])
	})
})
