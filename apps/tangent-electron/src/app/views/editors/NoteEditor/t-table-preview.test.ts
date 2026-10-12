import { afterEach, describe, expect, it } from 'vitest'
import './t-embed'
import { Editor, TextDocument, deltaFromDom, docToHTML, getIndexFromNodeAndOffset, getNodesForRange } from 'typewriter-editor'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import { parsePipeTable, type TableModel } from 'common/markdownModel/table'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import { eventHasSelectionRequest } from 'app/events'
import { revealContentAroundRange } from './editorModule'
import MarkdownEditor from './MarkdownEditor'
import type { NavigationEvent } from '../t-linkModule'
import { wait } from '@such-n-such/core'
import './t-table-preview'
import '../../../../../static/global.css'
import 'app/style/note.scss'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function preview(model: TableModel) {
	const element = document.createElement('t-table-preview')
	element.setAttribute('data-table-id', '7')
	element.setAttribute('model', JSON.stringify(model))
	document.body.appendChild(element)
	cleanups.push(() => element.remove())
	return element
}

function editorWithSource(source: string) {
	const editor = new Editor({ types: noteTypeset, doc: markdownToTextDocument(source) })
	const article = document.createElement('article')
	article.className = 'note'
	const root = document.createElement('div')
	article.appendChild(root)
	document.body.appendChild(article)
	editor.setRoot(root)
	cleanups.push(() => { editor.destroy(); article.remove() })
	return editor
}

describe('Table preview', () => {
	it('renders formatted cells and alignment entirely in Shadow DOM', () => {
		const element = preview(parsePipeTable('| A | B | C |\n| :--- | :---: | ---: |\n| **bold** | `a\\|b` | [[note]] |\n| short |'))
		const shadow = element.shadowRoot
		expect(element.textContent).toBe('')
		expect(shadow.querySelectorAll('thead tr')).toHaveLength(1)
		expect(shadow.querySelectorAll('tbody tr')).toHaveLength(2)
		expect(shadow.querySelector('strong:not(.hidden)').textContent).toBe('bold')
		expect(shadow.querySelector('code:not(.hidden)').textContent).toBe('a|b')
		expect(shadow.querySelector('t-link').getAttribute('href')).toBe('note')
		expect(Array.from(shadow.querySelectorAll('tbody tr:first-child td')).map((cell: HTMLElement) => cell.style.textAlign)).toEqual(['left', 'center', 'right'])
		expect(shadow.querySelectorAll('tbody tr:last-child td')).toHaveLength(3)
	})

	it('renders grid-shaped models with block content, spans, multiple headers, foot and caption', () => {
		const cell = (markdown: string, rowSpan = 1, columnSpan = 1) => ({ markdown, contentType: 'block' as const, rowSpan, columnSpan })
		const element = preview({
			columns: [{ alignment: 'left' }, { alignment: 'center' }, { alignment: 'right' }],
			head: [{ cells: [cell('Place', 2), cell('Range', 1, 2)] }, { cells: [cell('min'), cell('max')] }],
			body: [{ cells: [cell('Earth\n\n- blue\n- inhabited', 2), cell('cold'), cell('hot')] }, { cells: [cell('```\ncode\n```', 1, 2)] }],
			foot: [{ cells: [cell('Total', 1, 3)] }],
			caption: { markdown: 'A **caption**', contentType: 'inline' }
		})
		const shadow = element.shadowRoot
		expect(shadow.querySelectorAll('thead tr')).toHaveLength(2)
		expect(shadow.querySelector('thead th').getAttribute('rowspan')).toBe('2')
		expect(shadow.querySelectorAll('thead tr:last-child th')).toHaveLength(2)
		expect(shadow.querySelectorAll('tbody p.list')).toHaveLength(2)
		expect(shadow.querySelector('tbody tr:last-child td').getAttribute('colspan')).toBe('2')
		expect(shadow.querySelector('tbody pre code').textContent).toContain('code')
		expect(shadow.querySelector('tfoot td').getAttribute('colspan')).toBe('3')
		expect(shadow.querySelector('caption strong:not(.hidden)').textContent).toBe('caption')
	})

	it('updates the preview when the model changes', () => {
		const element = preview(parsePipeTable('| old |'))
		element.setAttribute('model', JSON.stringify(parsePipeTable('| new |')))
		expect(element.shadowRoot.querySelector('td').textContent).toBe('new')
	})

	it.each(['click', 'dblclick', 'mousedown', 'contextmenu'])('%s selects the matching source block', eventType => {
		const element = preview(parsePipeTable('| a |'))
		const event = new MouseEvent(eventType, { bubbles: true, composed: true })
		element.shadowRoot.querySelector('td').dispatchEvent(event)
		const request = eventHasSelectionRequest(event)
		expect(request.line({ table: { id: 7 } })).toBe(true)
		expect(request.line({ table: { id: 8 } })).toBe(false)
	})

	it('leaves preview links to the existing link event handling', () => {
		const element = preview(parsePipeTable('| [[note]] |'))
		const link = element.shadowRoot.querySelector('t-link')
		const event = new MouseEvent('click', { bubbles: true, composed: true, ctrlKey: true })
		link.dispatchEvent(event)
		expect((event as any).tLink).toBe(link)
		expect(eventHasSelectionRequest(event)).toBeUndefined()
	})

	it('retains the containing note as the origin of relative links', () => {
		const element = preview(parsePipeTable('| [relative](./other.md) | [[note]] |'))
		element.setAttribute('filepath', '/workspace/folder/source.md')
		const links = Array.from(element.shadowRoot.querySelectorAll('t-link'))
		expect(links.map(link => link.getAttribute('from'))).toEqual(['/workspace/folder/source.md', '/workspace/folder/source.md'])
	})
})

describe('Table source and editor offsets', () => {
	it('renders parsed grid blocks, spans, foot and caption with verbatim source and offsets', () => {
		const source = ': A **caption**\n\n+----------------+-------+\n| **Heading**            |\n+================+=======+\n| - one          | right |\n| - two          |       |\n|                +-------+\n| more           | next  |\n+================+=======+\n| footer                 |\n+================+=======+'
		const editor = editorWithSource(source)
		const element = editor.root.querySelector('t-table-preview')
		const shadow = element.shadowRoot
		expect(shadow.querySelector('thead th').getAttribute('colspan')).toBe('2')
		expect(shadow.querySelector('thead strong:not(.hidden)').textContent).toBe('Heading')
		expect(shadow.querySelector('tbody td').getAttribute('rowspan')).toBe('2')
		expect(shadow.querySelectorAll('tbody p.list')).toHaveLength(2)
		expect(shadow.querySelector('tfoot td').getAttribute('colspan')).toBe('2')
		expect(shadow.querySelector('caption strong:not(.hidden)').textContent).toBe('caption')
		expect(Array.from(editor.root.querySelectorAll('div.tableLine')).map(line => line.textContent).join('\n')).toBe(source)
		expect(element.textContent).toBe('')
		expect(typewriterToText(new TextDocument(deltaFromDom(editor, { root: editor.root, collapseWhitespace: false })))).toBe(source)
		for (let index = 0; index < source.length; index++) {
			if (source[index] === '\n') continue
			const [node, offset] = getNodesForRange(editor, [index, index])
			expect(getIndexFromNodeAndOffset(editor, node, offset)).toBe(index)
		}
		const change = editor.change
		revealContentAroundRange(editor.doc, [2, 2], change)
		change.apply()
		const emptyLine = editor.root.querySelectorAll('div.tableLine')[1]
		expect(emptyLine.getBoundingClientRect().height).toBeGreaterThan(0)
	})

	it('updates grid previews through edits and undo without altering border text', async () => {
		const source = '+-----+\n| old |\n+-----+'
		const editor = new MarkdownEditor(null, { doc: markdownToTextDocument(source) })
		const root = document.createElement('div')
		document.body.appendChild(root)
		editor.setRoot(root)
		cleanups.push(() => { editor.destroy(); root.remove() })
		const start = source.indexOf('old')
		editor.change.delete([start, start + 3]).insert(start, 'new').apply()
		await wait(20)
		expect(root.querySelector('t-table-preview').shadowRoot.querySelector('td').textContent).toBe('new')
		expect(typewriterToText(editor.doc)).toBe(source.replace('old', 'new'))
		editor.modules.history.undo()
		await wait(20)
		expect(typewriterToText(editor.doc)).toBe(source)
		expect(root.querySelector('t-table-preview').shadowRoot.querySelector('td').textContent).toBe('old')
	})

	it('keeps all source lines and separator text byte-identical while preview text is excluded', () => {
		const source = 'before\n  | **A** | B |\n  | --- | ---: |\n  | a\\|b |  | excess |\nafter'
		const editor = editorWithSource(source)
		const lines = editor.root.querySelectorAll('div.tableLine')
		expect(Array.from(lines).map(line => line.textContent).join('\n')).toBe(source.split('\n').slice(1, 4).join('\n'))
		expect(editor.root.querySelector('t-table-preview').textContent).toBe('')
		expect(typewriterToText(new TextDocument(deltaFromDom(editor, { root: editor.root, collapseWhitespace: false })))).toBe(source)
		for (let index = 0; index < source.length; index++) {
			if (source[index] === '\n') continue
			const [node, offset] = getNodesForRange(editor, [index, index])
			expect(getIndexFromNodeAndOffset(editor, node, offset)).toBe(index)
		}
	})

	it('reveals source around the caret using the block reveal convention', () => {
		const editor = editorWithSource('| A |\n| --- |\n| a |')
		const before = editor.root.querySelector('pre').getBoundingClientRect().height
		const change = editor.change
		revealContentAroundRange(editor.doc, [2, 2], change)
		change.apply()
		expect(editor.root.querySelector('figure').classList.contains('revealed')).toBe(true)
		expect(editor.root.querySelector('pre').getBoundingClientRect().height).toBeGreaterThan(before)
		const preview = editor.root.querySelector('t-table-preview')
		const bounds = preview.getBoundingClientRect()
		const style = getComputedStyle(preview)
		expect(bounds.height).toBeGreaterThan(0)
		// The output outline extends beyond its box; it must clear the source too.
		const outline = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth)
		expect(bounds.top - outline).toBeGreaterThanOrEqual(editor.root.querySelector('pre').getBoundingClientRect().bottom - 1)
	})

	it('exports readable Markdown source without a live preview dependency', () => {
		const source = '| **A** |\n| --- |\n| a |'
		const editor = editorWithSource(source)
		const root = document.createElement('div')
		root.innerHTML = docToHTML(editor, editor.doc)
		expect(root.querySelector('pre code').textContent).toBe(source)
		expect(root.querySelector('t-table-preview')).toBeNull()
	})

	it('updates the preview after real MarkdownEditor edits and undo', async () => {
		const editor = new MarkdownEditor(null, { doc: markdownToTextDocument('| old |\n| --- |\n| value |') })
		const root = document.createElement('div')
		document.body.appendChild(root)
		editor.setRoot(root)
		cleanups.push(() => { editor.destroy(); root.remove() })
		editor.change.delete([2, 5]).insert(2, '**new**').apply()
		await wait(20)
		expect(root.querySelector('t-table-preview').shadowRoot.querySelector('strong:not(.hidden)').textContent).toBe('new')
		expect(root.querySelector('div.tableLine').textContent).toBe('| **new** |')
		editor.modules.history.undo()
		await wait(20)
		expect(typewriterToText(editor.doc)).toBe('| old |\n| --- |\n| value |')
		expect(root.querySelector('t-table-preview').shadowRoot.querySelector('th').textContent).toBe('old')
	})

	it('routes modified link clicks through the enclosing MarkdownEditor', () => {
		const editor = new MarkdownEditor(null, { doc: markdownToTextDocument('| [[note]] |') })
		const root = document.createElement('div')
		document.body.appendChild(root)
		editor.setRoot(root)
		cleanups.push(() => { editor.destroy(); root.remove() })
		let href: string
		editor.on('navigate', event => { href = (event as NavigationEvent).link.href })
		const link = root.querySelector('t-table-preview').shadowRoot.querySelector('t-link')
		link.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ctrlKey: true }))
		expect(href).toBe('note')
	})

	it('clicks a visible preview to reveal and select its own source block', () => {
		const editor = new MarkdownEditor(null, { doc: markdownToTextDocument('before\n| A |\n| --- |\n| a |\nafter') })
		const article = document.createElement('article')
		article.className = 'note'
		const root = document.createElement('div')
		article.appendChild(root)
		document.body.appendChild(article)
		editor.setRoot(root)
		cleanups.push(() => { editor.destroy(); article.remove() })
		const cell = root.querySelector('t-table-preview').shadowRoot.querySelector('td')
		const bounds = cell.getBoundingClientRect()
		const options = { bubbles: true, composed: true, cancelable: true, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2 }
		cell.dispatchEvent(new MouseEvent('click', options))
		expect(editor.doc.getLineAt(editor.doc.selection[0]).attributes.table.id).toBe(1)
		cell.dispatchEvent(new MouseEvent('dblclick', options))
		expect(editor.doc.getText(editor.doc.selection)).toContain('| --- |')
	})
})
