import { describe, expect, test } from 'vitest'
import { wait } from '@such-n-such/core'
import { Editor, docToHTML } from 'typewriter-editor'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import 'app/style/note.scss'

function render(source: string) {
	const editor = new Editor({ types: noteTypeset })
	editor.setRoot(document.createElement('div'))

	const container = document.createElement('div')
	container.innerHTML = docToHTML(editor, markdownToTextDocument(source))
	return container
}

function createEditor(source: string) {
	const documentModel = markdownToTextDocument(source)
	const root = document.createElement('div')
	const editor = new Editor({ types: noteTypeset, doc: documentModel, root })
	return { documentModel, editor, root }
}

function createMarkdownEditor(source: string) {
	const root = document.createElement('div')
	const editor = new MarkdownEditor(null, {
		doc: markdownToTextDocument(source),
		root
	})
	return { editor, root }
}

describe('description-list HTML', () => {
	test('renders one semantic list for mixed inline and nested definitions', () => {
		const container = render(`- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`)
		const lists = container.querySelectorAll('dl.description-list')

		expect(lists).toHaveLength(1)
		expect(lists[0].querySelectorAll(':scope > dt')).toHaveLength(4)
		expect(lists[0].querySelectorAll(':scope > dd')).toHaveLength(4)
		expect(Array.from(lists[0].children, child => child.tagName)).toEqual([
			'DT', 'DD', 'DT', 'DT', 'DD', 'DD', 'DT', 'DD'
		])
	})

	test('separates groups across a blank line', () => {
		const container = render('- alpha :: one\n\n- beta :: two')
		expect(container.querySelectorAll('dl.description-list')).toHaveLength(2)
	})

	test('renders a description list nested under a regular list', () => {
		const container = render('- parent\n  - term :: definition')
		expect(container.querySelectorAll('p.list')).toHaveLength(1)
		expect(container.querySelectorAll('dl.description-list')).toHaveLength(1)
	})

	test('renders a description list inside a blockquote', () => {
		const container = render('> - term :: definition')
		expect(container.querySelector('blockquote dl.description-list')).not.toBeNull()
	})

	test('keeps one keyed editable element per Markdown line', () => {
		const source = `- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`
		const { documentModel, root } = createEditor(source)
		const lines = Array.from(root.querySelectorAll(':scope > .editor-description-list > .dl-line')) as any[]

		expect(lines).toHaveLength(documentModel.lines.length)
		expect(lines.map(line => line.key)).toEqual(documentModel.lines.map(line => line.id))
		expect(root.querySelector('dl')).toBeNull()
		const controls = lines[0].querySelector('.dl-separator-controls') as HTMLElement
		expect(controls.firstElementChild.classList.contains('inline-dl_sep-container')).toBe(true)
		expect(controls.lastElementChild.classList.contains('dl-description-toggle')).toBe(true)
		expect(controls.querySelector('.dl-separator-output').textContent).toBe('')
	})

	test('collapses inline and nested descriptions without hiding their terms', () => {
		const source = `- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`
		const { root } = createEditor(source)
		let lines = Array.from(root.querySelectorAll('.editor-description-list > .dl-line'))

		expect(root.querySelectorAll('.dl-description-toggle')).toHaveLength(4)

		const alphaToggle = lines[0].querySelector('.dl-description-toggle') as HTMLElement
		alphaToggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
		lines = Array.from(root.querySelectorAll('.editor-description-list > .dl-line'))
		expect(lines[0].classList.contains('dl-description-collapsed')).toBe(true)
		expect(lines[0].classList.contains('dl-collapsed-child')).toBe(false)

		const betaToggle = lines[1].querySelector('.dl-description-toggle') as HTMLElement
		betaToggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
		lines = Array.from(root.querySelectorAll('.editor-description-list > .dl-line'))
		expect(lines[1].classList.contains('dl-description-collapsed')).toBe(true)
		expect(lines.slice(2, 5).every(line => line.classList.contains('dl-collapsed-child'))).toBe(true)
		expect(lines[5].classList.contains('dl-collapsed-child')).toBe(false)
	})

	test('hides separator source again after the caret leaves it', () => {
		const { editor, root } = createMarkdownEditor('- term :: definition\nplain')
		const source = () => root.querySelector('.dl_sep-source') as HTMLElement

		editor.select(8)
		expect(source().classList.contains('revealed')).toBe(true)

		editor.select(editor.getText().length)
		expect(source().classList.contains('revealed')).toBe(false)
		const container = root.querySelector('.inline-dl_sep-container') as HTMLElement
		expect(container.classList.contains('revealed')).toBe(false)
	})

	test('reveals only the separator containing the caret', () => {
		const source = '- alpha :: one\n- beta :: two\n- gamma :: three\nplain'
		const { editor, root } = createMarkdownEditor(source)

		editor.select(source.indexOf('::') + 1)
		expect(root.querySelectorAll('.dl_sep-source.revealed')).toHaveLength(1)

		editor.select(editor.getText().length)
		expect(root.querySelectorAll('.dl_sep-source.revealed')).toHaveLength(0)
	})

	test('section collapse does not reveal description separators', async () => {
		const source = `- alpha :: first inline description
- beta ::
  - first nested description ::
    - third level item
  - second nested description
- gamma :: final inline description`
		const { editor, root } = createMarkdownEditor(source)
		const nestedLine = editor.doc.getLineRange(editor.doc.lines[3])

		editor.select(nestedLine[0])
		editor.collapsingSections.toggleLineCollapsed(1)
		await wait()
		expect(root.querySelectorAll('.dl_sep-source.revealed')).toHaveLength(0)

		editor.collapsingSections.toggleLineCollapsed(1)
		await wait()
		expect(root.querySelectorAll('.dl_sep-source.revealed')).toHaveLength(0)
	})

	test('hides separators after typing a description list and leaving it', async () => {
		const { editor, root } = createMarkdownEditor('')
		editor.select(0)

		for (const char of '- term :: definition\nplain') {
			editor.insert(char)
			await wait()
		}
		editor.select(editor.getText().length)

		expect(root.querySelectorAll('.dl_sep-source.revealed')).toHaveLength(0)
		expect(root.querySelector('.inline-dl_sep-container.revealed')).toBeNull()
	})

	test('separates a nested inline definition from term styling', async () => {
		const source = `- formatting ::
  - Furigana :: readings above kanji
plain`
		const { editor, root } = createMarkdownEditor('')
		editor.select(0)
		for (const char of source) {
			editor.insert(char)
			await wait()
		}
		editor.select(editor.getText().length)
		const article = document.createElement('article')
		article.classList.add('note')
		article.appendChild(root)
		document.body.appendChild(article)
		const nested = root.querySelectorAll('.dl-line')[1]
		const term = nested.querySelector('.dl-term-content') as HTMLElement
		const definition = nested.querySelector('.dl-definition-content') as HTMLElement

		expect(nested.classList.contains('dl-inline')).toBe(true)
		expect(term.textContent.endsWith('Furigana')).toBe(true)
		expect(definition.textContent).toBe('readings above kanji')
		expect(getComputedStyle(term).fontWeight).toBe('600')
		expect(getComputedStyle(definition).fontWeight).toBe('400')

		article.remove()
	})
})
