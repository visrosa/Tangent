import { afterEach, describe, expect, it } from 'vitest'
import TangentEmbed from './t-embed'
import MarkdownEditor from './MarkdownEditor'
import { markdownToTextDocument } from 'common/markdownModel'
import { docFromDom, Source } from 'typewriter-editor'
import { wait } from '@such-n-such/core'
import MarkdownView from './MarkdownView'
import { tooltips } from 'app/utils/tooltips'
import type TangentFootnote from './t-footnote'
import type { TangentLink } from './t-link'
import 'app/style/note.scss'
import '../../../../../static/global.css'

const editors: MarkdownEditor[] = []
function mount(source: string) {
	void TangentEmbed
	const root = document.createElement('article')
	root.className = 'note'
	root.style.whiteSpace = 'pre-wrap'
	document.body.append(root)
	const editor = new MarkdownEditor(null)
	editor.setRoot(root)
	editor.set(markdownToTextDocument(source))
	editors.push(editor)
	return editor
}
afterEach(() => editors.splice(0).forEach(editor => { const root = editor.root; editor.destroy(); root.remove() }))
function elements(editor: MarkdownEditor) { return Array.from(editor.root.querySelectorAll<TangentFootnote>('t-footnote')) }

describe('footnote rendering', () => {
	it('uses literal mnemonic keys and assigned numbers only for decimal-only keys', async () => {
		const source = 'A[^MiXeD][^x2][^字][^42][^٣]\n[^mixed]: Alpha\n[^x2]: Beta\n[^字]: Gamma\n[^42]: Delta\n[^٣]: Epsilon'
		const editor = mount(source)
		await wait()
		const buttons = elements(editor).map(el => el.shadowRoot.querySelector('button'))
		expect(buttons.slice(0, 5).map(button => button.textContent)).toEqual(['MiXeD', 'x2', '字', '4', '5'])
		expect(buttons[0].getAttribute('aria-label')).toBe('Go to footnote MiXeD: Alpha')
		expect(buttons[5].textContent).toBe('mixed ↩')
		expect(getComputedStyle(buttons[0]).verticalAlign).toBe('super')
		const link = document.createElement('t-link') as TangentLink
		editor.root.append(link)
		link.setLinkState('resolved', null)
		expect(getComputedStyle(buttons[0]).color).toBe(getComputedStyle(link).color)
		link.remove()
		expect(docFromDom(editor, editor.root).getText()).toBe(source)
	})

	it('resolves references inside a preview shadow root in the containing note', async () => {
		const source = 'text[^a]\n[^a]: citation'
		const editor = mount(source)
		const host = editor.root.querySelector<HTMLElement>('.line')
		const preview = host.attachShadow({ mode: 'open' })
		const marker = document.createElement('t-footnote')
		marker.setAttribute('footnote-key', 'a')
		preview.append(marker)
		await wait()
		expect(marker.shadowRoot.querySelector('button').textContent).toBe('a')
		marker.shadowRoot.querySelector<HTMLButtonElement>('button').click()
		await wait()
		expect(editor.doc.selection[0]).toBe(source.indexOf('[^a]:'))
	})
	it('keeps unused and duplicate definitions literal and escapes the preview', async () => {
		const editor = mount('A[^a]\n[^a]: `<img src=x onerror=alert(1)>`\n[^a]: Duplicate\n[^spare]: Unused')
		await wait()
		const nodes = elements(editor)
		expect(nodes[2].shadowRoot.querySelector('button')).toBeNull()
		expect(nodes[3].shadowRoot.querySelector('button')).toBeNull()
		nodes[0].dispatchEvent(new MouseEvent('mouseover'))
		await wait(1050)
		const preview = tooltips.value.at(-1).config.tooltip as string
		expect(preview).toContain('&lt;img')
		expect(preview).not.toContain('<img')
	})
	it('renders literal mnemonic keys in read-only views', async () => {
		const root = document.createElement('article')
		document.body.append(root)
		const view = new MarkdownView()
		view.setRoot(root)
		view.set(markdownToTextDocument('text[^a]\n[^a]: definition'), Source.api)
		await wait()
		expect(root.querySelector('t-footnote').shadowRoot.querySelector('button').textContent).toBe('a')
		root.querySelector('t-footnote').shadowRoot.querySelector<HTMLButtonElement>('button').click()
		expect(view.doc.selection[0]).toBe(9)
		view.destroy()
		root.remove()
	})
	it('isolates numbered output and preserves document offsets and DOM reconstruction', async () => {
		const source = 'A[^a][^a] Z\n\n[^a]: **Bold** text'
		const editor = mount(source)
		await wait()
		expect(elements(editor).map(el => el.shadowRoot.textContent.trim().slice(-1))).toEqual(['a', 'a', '↩'])
		expect(editor.root.textContent).toBe(source.replaceAll('\n', ''))
		expect(docFromDom(editor, editor.root).getText()).toBe(source)
		expect(editor.getText()).toBe(source)
	})
	it('jumps to the definition and returns to the clicked repeated reference', async () => {
		const source = 'A[^a]\nagain[^a]\n\n# Sources\n[^a]: Definition'
		const editor = mount(source)
		await wait()
		elements(editor)[1].shadowRoot.querySelector('button').click()
		await wait()
		expect(editor.doc.selection[0]).toBe(source.indexOf('[^a]:'))
		elements(editor)[2].shadowRoot.querySelector('button').click()
		await wait()
		expect(editor.doc.selection[0]).toBe(source.indexOf('[^a]', source.indexOf('again')))
		expect(editor.getText()).toBe(source)
	})
	it('updates distant references after a definition rename and undo', async () => {
		const source = 'A[^a]\n\n[^a]: Definition'
		const editor = mount(source)
		await wait()
		const position = source.lastIndexOf('a]')
		editor.change.delete([position, position + 1]).insert(position, 'b').apply()
		await wait()
		expect(elements(editor)[0].shadowRoot.querySelector('button')).toBeNull()
		expect(elements(editor)[0].shadowRoot.textContent).toContain('[^a]')
		editor.modules.history.undo()
		await wait()
		expect(elements(editor)[0].shadowRoot.querySelector('button').textContent).toBe('a')
	})
	it('renumbers digit-only references when an earlier one is inserted', async () => {
		const editor = mount('A[^42]\n[^42]: Alpha\n[^8]: Beta')
		await wait()
		editor.change.insert(0, '[^8] ').apply()
		await wait()
		expect(elements(editor).slice(0, 2).map(el => el.shadowRoot.querySelector('button').textContent)).toEqual(['1', '2'])
	})
})

it.runIf(!!markdownToTextDocument('| Label |').lines[0].attributes.table)('resolves a table-only reference and returns to retained table source', async () => {
 const source = '| Label |\n| --- |\n| value[^a] |\n\n[^a]: citation'
 const editor = mount(source)
 await wait()
 const marker = editor.root.querySelector('t-table-preview').shadowRoot.querySelector('t-footnote')
 expect(marker.shadowRoot.querySelector('button').textContent).toBe('a')
 marker.shadowRoot.querySelector<HTMLButtonElement>('button').click()
 await wait()
 expect(editor.doc.selection[0]).toBe(source.indexOf('[^a]:'))
 elements(editor).at(-1).shadowRoot.querySelector<HTMLButtonElement>('button').click()
 await wait()
 expect(editor.doc.selection[0]).toBe(0)
 expect(editor.getText()).toBe(source)
})
