import { describe, expect, test } from 'vitest'
import { Editor, docToHTML } from 'typewriter-editor'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import noteTypeset from 'common/markdownModel/typewriterTypes'

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
})
