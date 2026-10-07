import { describe, expect, test } from 'vitest'
import { wait } from '@such-n-such/core'
import { Editor, docFromHTML, docToHTML } from 'typewriter-editor'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import type { DlLineData } from 'common/markdownModel/dl'
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

/** Each list item as [tag, text], with a nested list as ['SUBTREE', items] */
function structure(list: Element): any[] {
	return Array.from(list.children, child => child.classList.contains('dl-subtree')
		? ['SUBTREE', structure(child.querySelector(':scope > dl.description-list'))]
		: [child.tagName, child.textContent])
}

function mountInNote(root: HTMLElement) {
	const article = document.createElement('article')
	article.classList.add('note')
	article.appendChild(root)
	document.body.appendChild(article)
	return article
}

function textLeft(element: Element, text: string) {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	while (walker.nextNode()) {
		const node = walker.currentNode
		const offset = node.textContent.indexOf(text)
		if (offset < 0) continue
		const range = document.createRange()
		range.setStart(node, offset)
		range.setEnd(node, offset + 1)
		return range.getBoundingClientRect().left
	}
	throw new Error(`"${text}" not found`)
}

describe('description-list HTML', () => {
	test('keeps a later separator as literal definition text', () => {
		const container = render('- 🜨 :: Terra or Earth :: Alchemical symbol for antimony')
		const list = container.querySelector('dl.description-list')

		expect(Array.from(list.children, child => child.tagName)).toEqual(['DT', 'DD'])
		expect(Array.from(list.children, child => child.textContent)).toEqual([
			'🜨',
			'Terra or Earth :: Alchemical symbol for antimony'
		])
	})

	test('gives inline and expanded single descriptions equivalent semantic HTML', () => {
		const compact = render('- 🜨 :: Terra or Earth')
		const expanded = render(`- 🜨 ::
  - Terra or Earth`)
		const signature = (container: HTMLElement) => Array.from(
			container.querySelector('dl.description-list').children,
			child => [child.tagName, child.textContent]
		)

		expect(signature(compact)).toEqual(signature(expanded))
	})

	test('nests term children inside a definition of their parent', () => {
		const inlineParent = render(`- A :: 1
  - B :: 2
  - C :: 3`)
		const bareParent = render(`- A ::
  - 1
  - B :: 2
  - C :: 3`)
		const nested = [['DT', 'B'], ['DD', '2'], ['DT', 'C'], ['DD', '3']]

		expect(structure(inlineParent.querySelector('dl.description-list')))
			.toEqual([['DT', 'A'], ['DD', '1'], ['SUBTREE', nested]])
		expect(structure(bareParent.querySelector('dl.description-list')))
			.toEqual([['DT', 'A'], ['DD', '1'], ['SUBTREE', nested]])
		expect(inlineParent.querySelector('dd').hasAttribute('data-dl-term-indent')).toBe(false)
		expect(bareParent.querySelector('dd').getAttribute('data-dl-term-indent')).toBe('')
	})

	test('keeps values and nested terms of one parent in source order', () => {
		const container = render(`- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`)

		expect(container.querySelectorAll(':scope > dl.description-list')).toHaveLength(1)
		expect(structure(container.querySelector('dl.description-list'))).toEqual([
			['DT', 'alpha'],
			['DD', 'one'],
			['DT', 'beta'],
			['SUBTREE', [['DT', 'first'], ['DD', 'third level item']]],
			['DD', 'second'],
			['DT', 'gamma'],
			['DD', 'three']
		])
	})

	test.each([
		['nested terms', `- beta ::
  - first ::
    - one
  - second`],
		['a multi-term group', `- uses ::
- requires ::
  - npm
  - typescript`],
	])('reads its own HTML back as the same lines for %s', (_name, source) => {
		const editor = new Editor({ types: noteTypeset })
		editor.setRoot(document.createElement('div'))
		const original = markdownToTextDocument(source)
		const roundTripped = docFromHTML(editor, docToHTML(editor, original))
		const signature = (lines: typeof original.lines) => lines.map(line => {
			const { glyph, ...dl } = line.attributes.dl as DlLineData
			return dl
		})

		expect(roundTripped.lines).toHaveLength(original.lines.length)
		expect(signature(roundTripped.lines)).toEqual(signature(original.lines))
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
		const separator = lines[0].querySelector('.dl-separator') as HTMLElement
		expect(separator.children).toHaveLength(1)
		expect(separator.firstElementChild.classList.contains('inline-dl_sep-container')).toBe(true)
		expect(separator.querySelector('.dl-separator-output').textContent).toBe('')
	})

	test('collapses inline and nested descriptions without hiding their terms', async () => {
		const { editor, root } = createMarkdownEditor(`- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`)
		const lines = () => Array.from(root.querySelectorAll('.editor-description-list > .dl-line'))

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(lines()[0].classList.contains('dl-description-collapsed')).toBe(true)
		expect(lines().some(line => line.classList.contains('collapsed'))).toBe(false)

		editor.collapsingSections.toggleLineCollapsed(1)
		await wait()
		expect(lines()[1].classList.contains('dl-description-collapsed')).toBe(true)
		expect(lines().map(line => line.classList.contains('collapsed')))
			.toEqual([false, false, true, true, true, false])
	})

	test('collapses description subtrees independently at arbitrary depth', async () => {
		const { editor, root } = createMarkdownEditor(`- term :: description
  - term2 ::
    - descA
    - descB
    - term3 ::
      - descC`)
		const collapsed = () => Array.from(root.querySelectorAll('.editor-description-list > .dl-line'),
			line => line.classList.contains('collapsed'))

		editor.collapsingSections.toggleLineCollapsed(4)
		await wait()
		expect(collapsed()).toEqual([false, false, false, false, false, true])

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(collapsed()).toEqual([false, true, true, true, true, true])

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(collapsed()).toEqual([false, false, false, false, false, true])
	})

	test('aligns expanded values with compact definitions and shrinks the term when collapsed', async () => {
		const { editor, root } = createMarkdownEditor(`- 🜨 ::
  - Terra or Earth
  - Alchemical symbol for antimony
- next :: value`)
		const article = mountInNote(root)
		const lines = () => Array.from(root.querySelectorAll('.editor-description-list > .dl-line')) as HTMLElement[]

		expect(lines().map(line => line.style.gridRow)).toEqual(['1 / span 2', '1', '2', '3'])
		expect(lines()[1].getBoundingClientRect().left).toBe(lines()[2].getBoundingClientRect().left)
		const expandedHeight = lines()[0].getBoundingClientRect().height

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()

		expect(lines().map(line => line.style.gridRow)).toEqual(['1', '', '', '2'])
		expect(lines()[0].classList.contains('dl-description-collapsed')).toBe(true)
		expect(lines().slice(1, 3).every(line => getComputedStyle(line).display === 'none')).toBe(true)
		expect(getComputedStyle(lines()[0], '::after').content).toBe('"\u22ef"')
		expect(lines()[0].getBoundingClientRect().height).toBeLessThan(expandedHeight)
		article.remove()
	})

	test('hides an inline definition while its term is collapsed', async () => {
		const { editor, root } = createMarkdownEditor('- 🜨 :: Terra or Earth\nplain')
		const article = mountInNote(root)
		const line = () => root.querySelector('.dl-inline') as HTMLElement

		expect(getComputedStyle(line().querySelector('.dl-definition')).display).not.toBe('none')

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(getComputedStyle(line().querySelector('.dl-definition')).display).toBe('none')
		expect(getComputedStyle(line(), '::after').content).toBe('"\u22ef"')

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(getComputedStyle(line().querySelector('.dl-definition')).display).not.toBe('none')
		article.remove()
	})

	test('renders text after the first separator as one inline definition', () => {
		const { root } = createEditor('- 🜨 :: Terra or Earth :: Alchemical symbol for antimony')
		const line = root.querySelector('.dl-inline') as HTMLElement
		const definitions = Array.from(line.querySelectorAll('.dl-definition'))

		expect(definitions).toHaveLength(1)
		expect(definitions[0].textContent).toBe('Terra or Earth :: Alchemical symbol for antimony')
		expect(line.querySelectorAll('.dl_sep-source')).toHaveLength(1)
	})

	test('starts value text at the same edge as inline definition text', () => {
		const { root } = createEditor(`- alpha :: one
- beta ::
  - two`)
		const article = mountInNote(root)

		expect(textLeft(root.querySelector('.dl-value'), 'two'))
			.toBeCloseTo(textLeft(root.querySelector('.dl-definition'), 'one'), 0)
		article.remove()
	})

	test('reveals the space after a value glyph together with the glyph', () => {
		const source = '- beta ::\n  - two\nplain'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		const glyph = () => root.querySelector('.dl-value .line_format.dl') as HTMLElement

		expect(glyph().textContent).toBe('- ')
		expect(getComputedStyle(glyph()).fontSize).toBe('0px')

		editor.select(source.indexOf('two'))
		expect(getComputedStyle(glyph()).fontSize).not.toBe('0px')
		article.remove()
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
		const definition = nested.querySelector('.dl-definition') as HTMLElement

		expect(nested.classList.contains('dl-inline')).toBe(true)
		expect(term.textContent.endsWith('Furigana')).toBe(true)
		expect(definition.textContent).toBe('readings above kanji')
		expect(getComputedStyle(term).fontWeight).toBe('600')
		expect(getComputedStyle(definition).fontWeight).toBe('400')

		article.remove()
	})
})
