import { describe, expect, test } from 'vitest'
import { wait } from '@such-n-such/core'
import { Editor, deltaFromDom, docFromHTML, docToHTML } from 'typewriter-editor'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import { getLineBounds } from './lineGeometry'
import type { AssociationListLineData } from 'common/markdownModel/associationList'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import '../../../../../static/global.css'
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
	return Array.from(list.children, child => child.classList.contains('association-list-subtree')
		? ['SUBTREE', structure(child.querySelector(':scope > dl.association-list'))]
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

describe('association-list HTML', () => {
	test('keeps a later separator as literal value text', () => {
		const container = render('- 🜨 :: Terra or Earth :: Alchemical symbol for antimony')
		const list = container.querySelector('dl.association-list')

		expect(Array.from(list.children, child => child.tagName)).toEqual(['DT', 'DD'])
		expect(Array.from(list.children, child => child.textContent)).toEqual([
			'🜨',
			'Terra or Earth :: Alchemical symbol for antimony'
		])
	})

	test('gives inline and expanded single values equivalent semantic HTML', () => {
		const compact = render('- 🜨 :: Terra or Earth')
		const expanded = render(`- 🜨 ::
  - Terra or Earth`)
		const signature = (container: HTMLElement) => Array.from(
			container.querySelector('dl.association-list').children,
			child => [child.tagName, child.textContent]
		)

		expect(signature(compact)).toEqual(signature(expanded))
	})

	test('nests term children inside a value of their parent', () => {
		const inlineParent = render(`- A :: 1
  - B :: 2
  - C :: 3`)
		const bareParent = render(`- A ::
  - 1
  - B :: 2
  - C :: 3`)
		const nested = [['DT', 'B'], ['DD', '2'], ['DT', 'C'], ['DD', '3']]

		expect(structure(inlineParent.querySelector('dl.association-list')))
			.toEqual([['DT', 'A'], ['DD', '1'], ['SUBTREE', nested]])
		expect(structure(bareParent.querySelector('dl.association-list')))
			.toEqual([['DT', 'A'], ['DD', '1'], ['SUBTREE', nested]])
		expect(inlineParent.querySelector('dd').hasAttribute('data-association-list-term-indent')).toBe(false)
		expect(bareParent.querySelector('dd').getAttribute('data-association-list-term-indent')).toBe('')
	})

	test('keeps values and nested terms of one parent in source order', () => {
		const container = render(`- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`)

		expect(container.querySelectorAll(':scope > dl.association-list')).toHaveLength(1)
		expect(structure(container.querySelector('dl.association-list'))).toEqual([
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
			const { glyph, ...associationList } = line.attributes.associationList as AssociationListLineData
			return associationList
		})

		expect(roundTripped.lines).toHaveLength(original.lines.length)
		expect(signature(roundTripped.lines)).toEqual(signature(original.lines))
	})

	test.each(['\t', '  '])('lays out terms sharing a value with %j indentation', async indent => {
		const source = `- Term1 ::\n- Term2 ::\n${indent}- Describes both\nplain`
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		const lines = () => Array.from(root.querySelectorAll('.association-list-line')) as HTMLElement[]
		try {
			expect(structure(render(source).querySelector('dl.association-list')))
				.toEqual([['DT', 'Term1'], ['DT', 'Term2'], ['DD', 'Describes both']])
			expect(lines().map(line => line.style.gridRow)).toEqual(['1', '2', '1 / span 2'])
			expect(lines()[0].classList.contains('association-list-group-term')).toBe(true)
			expect(lines()[2].getBoundingClientRect().top).toBe(lines()[0].getBoundingClientRect().top)
			expect(lines()[2].getBoundingClientRect().bottom).toBe(lines()[1].getBoundingClientRect().bottom)
			editor.collapsingSections.toggleLineCollapsed(1)
			await wait()
			expect(lines().map(line => line.style.gridRow)).toEqual(['1', '2', ''])
			expect(lines()[1].querySelector('.association-list-summary').getAttribute('data-summary')).toBe('Describes both')
			expect(lines().slice(0, 2).every(line => getComputedStyle(line).display !== 'none')).toBe(true)
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
			editor.collapsingSections.toggleLineCollapsed(1)
			await wait()
			expect(lines().map(line => line.style.gridRow)).toEqual(['1', '2', '1 / span 2'])
		} finally {
			editor.destroy()
			article.remove()
		}
	})

	test.each(['\t', '  '])('lays out a nested term beside its parent with %j indentation', indent => {
		const source = `- Term1 ::\n${indent}- Term1.1 ::\n${indent}${indent}- Desc1.1`
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		try {
			expect(structure(render(source).querySelector('dl.association-list')))
				.toEqual([['DT', 'Term1'], ['SUBTREE', [['DT', 'Term1.1'], ['DD', 'Desc1.1']]]])
			const lines = Array.from(root.querySelectorAll('.association-list-line')) as HTMLElement[]
			expect(lines.map(line => line.style.gridRow)).toEqual(['1', '1', '1'])
			expect(lines.map(line => line.getBoundingClientRect().top))
				.toEqual(Array(3).fill(lines[0].getBoundingClientRect().top))
			expect(textLeft(lines[1], 'Term1.1')).toBeGreaterThan(textLeft(lines[0], 'Term1'))
			expect(textLeft(lines[2], 'Desc1.1')).toBeGreaterThan(textLeft(lines[1], 'Term1.1'))
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		} finally {
			editor.destroy()
			article.remove()
		}
	})

	test('separates groups across a blank line', () => {
		const container = render('- alpha :: one\n\n- beta :: two')
		expect(container.querySelectorAll('dl.association-list')).toHaveLength(2)
	})

	test.each([
		['plain', 'uses ::\nrequires ::\n: electron\n: npm\nplain', ['1', '2', '1', '2']],
		['mixed', '- uses ::\nrequires ::\n: electron\n: npm\nplain', ['1', '2', '1', '2']],
		['nested', 'System ::\n\tPlanet ::\n\t: A nested value\nplain', ['1', '1', '1']],
		['quoted', '> uses ::\n> requires ::\n> : electron\n> : npm\nplain', ['1', '2', '1', '2']],
	])('renders, edits and collapses %s portable forms', async (_name, source, rows) => {
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		const lines = () => Array.from(root.querySelectorAll('.association-list-line')) as HTMLElement[]
		const owner = rows.length === 4 ? 1 : 0
		try {
			expect(lines().map(line => line.style.gridRow)).toEqual(rows)
			expect(lines().map(line => (line as any).key)).toEqual(editor.doc.lines.slice(0, -1).map(line => line.id))
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
			editor.collapsingSections.toggleLineCollapsed(owner)
			await wait()
			expect(lines()[owner].querySelector('.association-list-summary')).not.toBeNull()
			expect(lines().slice(owner + 1).every(line => getComputedStyle(line).display === 'none')).toBe(true)
			editor.select(source.indexOf('::') + 1)
			await wait()
			expect(root.querySelector('.association_separator-source.revealed')).not.toBeNull()
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
			editor.select(source.length)
			editor.collapsingSections.toggleLineCollapsed(owner)
			await wait()
			expect(lines().map(line => line.style.gridRow)).toEqual(rows)
		} finally {
			editor.destroy()
			article.remove()
		}
	})

	test('exports portable and list forms as equivalent semantic groups', () => {
		const source = 'uses ::\nrequires ::\n: electron\n: npm'
		const list = '- uses ::\n- requires ::\n\t- electron\n\t- npm'
		expect(structure(render(source).querySelector('dl.association-list')))
			.toEqual(structure(render(list).querySelector('dl.association-list')))
		const editor = new Editor({ types: noteTypeset })
		editor.setRoot(document.createElement('div'))
		const original = markdownToTextDocument(source)
		const restored = docFromHTML(editor, docToHTML(editor, original))
		expect(restored.lines.map(line => line.attributes.associationList))
			.toEqual(original.lines.map(line => ({ ...line.attributes.associationList, glyph: undefined })))
		editor.destroy()
	})

	test('continues colon values on Enter and clears an empty marker', async () => {
		const { userEvent } = await import('vitest/browser')
		const source = 'term ::\n: value'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		try {
			editor.select(source.length)
			root.focus()
			await userEvent.keyboard('{Enter}')
			expect(editor.getText()).toBe(source + '\n: ')
			await userEvent.keyboard('{Enter}')
			expect(editor.getText()).toBe(source + '\n\n')
		} finally {
			editor.destroy()
			article.remove()
		}
	})

	test('types a portable term and value without changing source', async () => {
		const source = 'term ::\n: value\nplain'
		const { editor, root } = createMarkdownEditor('')
		const article = mountInNote(root)
		try {
			editor.select(0)
			for (let index = 0; index < source.length; index++) {
				editor.insert(source[index])
				await wait()
				expect(editor.getText()).toBe(source.slice(0, index + 1))
			}
			expect(editor.doc.lines.map(line => line.attributes.associationList?.role)).toEqual(['term', 'value', undefined])
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		} finally {
			editor.destroy()
			article.remove()
		}
	})

	test.each([
		['more terms', '- first ::\n- second ::\n- third ::\n\t- value one\n\t- value two\n- next :: final', ['1', '2', '3', '1', '2 / span 2', '4']],
		['more values', '- first ::\n- second ::\n\t- value one\n\t- value two\n\t- value three\n- next :: final', ['1', '2 / span 2', '1', '2', '3', '4']],
		['nested shared terms', '- parent ::\n\t- first ::\n\t- second ::\n\t\t- value\n- next :: final', ['1 / span 2', '1', '2', '1 / span 2', '3']],
		['an inline owner', '- first ::\n- second :: inline\n\t- child :: value\n- next :: final', ['1', '1 / span 2', '2', '3']],
		['separate subtrees', '- first ::\n\t- child ::\n\t\t- value\n- second ::\n\t- second value', ['1', '1', '1', '2', '2']],
	])('keeps group and subtree boundaries with %s', (_name, source, rows) => {
		const { editor, root } = createMarkdownEditor(source)
		try {
			expect(Array.from(root.querySelectorAll('.association-list-line'), (line: HTMLElement) => line.style.gridRow)).toEqual(rows)
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		} finally { editor.destroy() }
	})

	test.each([
		['shared', '- Term1 ::\n- Term2 ::\n\t- Describes both', ['1', '2', '1 / span 2']],
		['nested', '- Term1 ::\n\t- Term1.1 ::\n\t\t- Desc1.1', ['1', '1', '1']],
	])('keeps the %s structure while typing and editing', async (_name, source, rows) => {
		const { editor, root } = createMarkdownEditor('')
		try {
			editor.select(0)
			for (const char of source) {
				editor.insert(char)
				await wait()
			}
			const lineRows = () => Array.from(root.querySelectorAll('.association-list-line'), (line: HTMLElement) => line.style.gridRow)
			expect(lineRows()).toEqual(rows)
			expect(editor.doc.lines.map(line => line.attributes.associationList.role)).toEqual(['term', 'term', 'value'])
			editor.select(source.indexOf('Term1') + 5)
			editor.insert(' edited')
			await wait()
			expect(lineRows()).toEqual(rows)
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join(''))
				.toBe(source.replace('Term1', 'Term1 edited') + '\n')
		} finally { editor.destroy() }
	})

	test('renders a association list nested under a regular list', () => {
		const container = render('- parent\n  - term :: value')
		expect(container.querySelectorAll('p.list')).toHaveLength(1)
		expect(container.querySelectorAll('dl.association-list')).toHaveLength(1)
	})

	test('renders a association list inside a blockquote', () => {
		const container = render('> - term :: value')
		expect(container.querySelector('blockquote dl.association-list')).not.toBeNull()
	})

	test('keeps one keyed editable element per Markdown line', () => {
		const source = `- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`
		const { documentModel, root } = createEditor(source)
		const lines = Array.from(root.querySelectorAll(':scope > .editor-association-list > .association-list-line')) as any[]

		expect(lines).toHaveLength(documentModel.lines.length)
		expect(lines.map(line => line.key)).toEqual(documentModel.lines.map(line => line.id))
		expect(root.querySelector('dl')).toBeNull()
		const separator = lines[0].querySelector('.association-list-separator') as HTMLElement
		expect(separator.children).toHaveLength(1)
		expect(separator.firstElementChild.classList.contains('inline-association_separator-container')).toBe(true)
		expect(separator.querySelector('.association-list-separator-output').textContent).toBe('')
	})

	test('collapses inline and nested values without hiding their terms', async () => {
		const { editor, root } = createMarkdownEditor(`- alpha :: one
- beta ::
  - first ::
    - third level item
  - second
- gamma :: three`)
		const lines = () => Array.from(root.querySelectorAll('.editor-association-list > .association-list-line'))

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(lines()[0].classList.contains('association-list-values-collapsed')).toBe(true)
		expect(lines().some(line => line.classList.contains('collapsed'))).toBe(false)

		editor.collapsingSections.toggleLineCollapsed(1)
		await wait()
		expect(lines()[1].classList.contains('association-list-values-collapsed')).toBe(true)
		expect(lines().map(line => line.classList.contains('collapsed')))
			.toEqual([false, false, true, true, true, false])
	})

	test('collapses value subtrees independently at arbitrary depth', async () => {
		const { editor, root } = createMarkdownEditor(`- term :: value
  - term2 ::
    - descA
    - descB
    - term3 ::
      - descC`)
		const collapsed = () => Array.from(root.querySelectorAll('.editor-association-list > .association-list-line'),
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

	test('aligns expanded values with compact values and shrinks the term when collapsed', async () => {
		const { editor, root } = createMarkdownEditor(`- 🜨 ::
  - Terra or Earth
  - Alchemical symbol for antimony
- next :: value`)
		const article = mountInNote(root)
		const lines = () => Array.from(root.querySelectorAll('.editor-association-list > .association-list-line')) as HTMLElement[]

		expect(lines().map(line => line.style.gridRow)).toEqual(['1 / span 2', '1', '2', '3'])
		expect(lines()[1].getBoundingClientRect().left).toBe(lines()[2].getBoundingClientRect().left)
		const expandedHeight = lines()[0].getBoundingClientRect().height

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()

		expect(lines().map(line => line.style.gridRow)).toEqual(['1', '', '', '2'])
		expect(lines()[0].classList.contains('association-list-values-collapsed')).toBe(true)
		expect(lines().slice(1, 3).every(line => getComputedStyle(line).display === 'none')).toBe(true)
		expect(lines()[0].querySelector('.association-list-summary').getAttribute('data-summary')).toBe('Terra or Earth · Alchemical symbol for antimony')
		expect(getComputedStyle(lines()[0].querySelector('.association-list-summary')).whiteSpace).toBe('nowrap')
		expect(lines()[0].getBoundingClientRect().height).toBeLessThan(expandedHeight)
		article.remove()
	})

	test('gives rows to collapsed lines revealed around the caret', async () => {
		const source = '- term ::\n  - first\n  - second\nplain'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		editor.select(source.indexOf('first'))
		await wait()
		const lines = Array.from(root.querySelectorAll('.editor-association-list > .association-list-line')) as HTMLElement[]

		expect(lines.slice(1).every(line => line.classList.contains('collapsed-revealed'))).toBe(true)
		expect(lines.map(line => line.style.gridRow)).toEqual(['1 / span 2', '1', '2'])
		expect(lines.slice(1).every(line => getComputedStyle(line).display !== 'none')).toBe(true)
		expect(lines[0].classList.contains('association-list-values-collapsed')).toBe(false)
		article.remove()
	})

	test('keeps an inline value on one clipped line while its term is collapsed', async () => {
		const { editor, root } = createMarkdownEditor('- 🜨 :: Terra or Earth\nplain')
		const article = mountInNote(root)
		const line = () => root.querySelector('.association-list-inline') as HTMLElement

		expect(getComputedStyle(line().querySelector('.association-list-value-content')).display).not.toBe('none')

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(getComputedStyle(line().querySelector('.association-list-value-content')).display).not.toBe('none')
		expect(getComputedStyle(line().querySelector('.association-list-value-content')).whiteSpace).toBe('nowrap')
		expect(getComputedStyle(line().querySelector('.association-list-value-content')).textOverflow).toBe('clip')

		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(getComputedStyle(line().querySelector('.association-list-value-content')).display).not.toBe('none')
		article.remove()
	})

	test.each(['', '> '])('keeps inline code on the collapsed value line with prefix %j', async prefix => {
		const source = prefix + '- term :: A reference entry in `sample  catalog.txt`[^catalog] explains how several related examples are grouped together.\n[^catalog]: A synthetic reference.\nplain'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		article.style.width = '320px'
		const value = () => root.querySelector('.association-list-value-content') as HTMLElement
		const code = () => value().querySelector('code.inline_code:not(.hidden)') as HTMLElement
		try {
			expect(value().getBoundingClientRect().height).toBeGreaterThan(parseFloat(getComputedStyle(value()).lineHeight) * 1.5)
			editor.collapsingSections.toggleLineCollapsed(0)
			await wait()
			expect(value().getBoundingClientRect().height).toBeLessThan(parseFloat(getComputedStyle(value()).lineHeight) * 1.5)
			expect(value().querySelector('.folded-text-content').scrollWidth).toBeGreaterThan(value().querySelector('.folded-text-content').clientWidth)
			expect(code().textContent.replace(/\u00a0/g, ' ')).toBe('sample  catalog.txt')
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
			editor.select(source.indexOf('sample') + 1)
			expect(getComputedStyle(code()).whiteSpace).toBe('pre-wrap')
			expect(value().getBoundingClientRect().height).toBeGreaterThan(parseFloat(getComputedStyle(value()).lineHeight) * 1.5)
			editor.select(source.length)
			editor.collapsingSections.toggleLineCollapsed(0)
			await wait()
			expect(getComputedStyle(code()).whiteSpace).toBe('pre-wrap')
			expect(value().getBoundingClientRect().height).toBeGreaterThan(parseFloat(getComputedStyle(value()).lineHeight) * 1.5)
		} finally {
			editor.destroy()
			article.remove()
		}
	})

	test('renders text after the first separator as one inline value', () => {
		const { root } = createEditor('- 🜨 :: Terra or Earth :: Alchemical symbol for antimony')
		const line = root.querySelector('.association-list-inline') as HTMLElement
		const values = Array.from(line.querySelectorAll('.association-list-value-content'))

		expect(values).toHaveLength(1)
		expect(values[0].textContent).toBe('Terra or Earth :: Alchemical symbol for antimony')
		expect(line.querySelectorAll('.association_separator-source')).toHaveLength(1)
	})

	test('starts value text at the same edge as inline value text', () => {
		const { root } = createEditor(`- alpha :: one
- beta ::
  - two`)
		const article = mountInNote(root)

		expect(textLeft(root.querySelector('.association-list-value'), 'two'))
			.toBeCloseTo(textLeft(root.querySelector('.association-list-value-content'), 'one'), 0)
		article.remove()
	})

	test('starts a nested group at its parent value text', () => {
		const nestedSource = `- root :: Sol, our nearest star
  - r :: Nominal Solar Radius
  - longer nested term :: Nominal Total Solar Irradiance`
		const { root } = createEditor(nestedSource)
		const { root: flatRoot } = createEditor('- root :: Sol, our nearest star')
		const article = mountInNote(root)
		const flatArticle = mountInNote(flatRoot)
		const lines = root.querySelectorAll('.association-list-line')
		const valueLeft = (line: Element) => textLeft(line.querySelector('.association-list-value-content'), 'Nominal')
		const rootDefinitionLeft = textLeft(lines[0].querySelector('.association-list-value-content'), 'Sol')

		expect(textLeft(lines[1].querySelector('.association-list-term-content'), 'r')).toBeCloseTo(rootDefinitionLeft, 0)
		expect(valueLeft(lines[1])).toBeCloseTo(valueLeft(lines[2]), 0)
		expect(rootDefinitionLeft)
			.toBeCloseTo(textLeft(flatRoot.querySelector('.association-list-value-content'), 'Sol'), 0)
		article.remove()
		flatArticle.remove()
	})

	test('indents a association list nested under a regular list item', () => {
		const { root } = createEditor('- parent\n  - term :: value')
		const article = mountInNote(root)

		expect(parseFloat(getComputedStyle(root.querySelector('.editor-association-list')).marginLeft))
			.toBeGreaterThan(0)
		article.remove()
	})

	test('reveals the space after a value glyph together with the glyph', () => {
		const source = '- beta ::\n  - two\nplain'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		const glyph = () => root.querySelector('.association-list-value .line_format.associationList') as HTMLElement

		expect(glyph().textContent).toBe('- ')
		expect(getComputedStyle(glyph()).fontSize).toBe('0px')

		editor.select(source.indexOf('two'))
		expect(getComputedStyle(glyph()).fontSize).not.toBe('0px')
		article.remove()
	})

	test('hides separator source again after the caret leaves it', () => {
		const { editor, root } = createMarkdownEditor('- term :: value\nplain')
		const source = () => root.querySelector('.association_separator-source') as HTMLElement

		editor.select(8)
		expect(source().classList.contains('revealed')).toBe(true)

		editor.select(editor.getText().length)
		expect(source().classList.contains('revealed')).toBe(false)
		const container = root.querySelector('.inline-association_separator-container') as HTMLElement
		expect(container.classList.contains('revealed')).toBe(false)
	})

	test('reveals only the separator containing the caret', () => {
		const source = '- alpha :: one\n- beta :: two\n- gamma :: three\nplain'
		const { editor, root } = createMarkdownEditor(source)

		editor.select(source.indexOf('::') + 1)
		expect(root.querySelectorAll('.association_separator-source.revealed')).toHaveLength(1)

		editor.select(editor.getText().length)
		expect(root.querySelectorAll('.association_separator-source.revealed')).toHaveLength(0)
	})

	test('section collapse does not reveal association separators', async () => {
		const source = `- alpha :: first inline value
- beta ::
  - first nested value ::
    - third level item
  - second nested value
- gamma :: final inline value`
		const { editor, root } = createMarkdownEditor(source)
		const nestedLine = editor.doc.getLineRange(editor.doc.lines[3])

		editor.select(nestedLine[0])
		editor.collapsingSections.toggleLineCollapsed(1)
		await wait()
		expect(root.querySelectorAll('.association_separator-source.revealed')).toHaveLength(0)

		editor.collapsingSections.toggleLineCollapsed(1)
		await wait()
		expect(root.querySelectorAll('.association_separator-source.revealed')).toHaveLength(0)
	})

	test('hides separators after typing a association list and leaving it', async () => {
		const { editor, root } = createMarkdownEditor('')
		editor.select(0)

		for (const char of '- term :: value\nplain') {
			editor.insert(char)
			await wait()
		}
		editor.select(editor.getText().length)

		expect(root.querySelectorAll('.association_separator-source.revealed')).toHaveLength(0)
		expect(root.querySelector('.inline-association_separator-container.revealed')).toBeNull()
	})

	test('separates a nested inline value from term styling', async () => {
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
		const nested = root.querySelectorAll('.association-list-line')[1]
		const term = nested.querySelector('.association-list-term-content') as HTMLElement
		const value = nested.querySelector('.association-list-value-content') as HTMLElement

		expect(nested.classList.contains('association-list-inline')).toBe(true)
		expect(term.textContent.endsWith('Furigana')).toBe(true)
		expect(value.textContent).toBe('readings above kanji')
		expect(getComputedStyle(term).fontWeight).toBe('600')
		expect(getComputedStyle(value).fontWeight).toBe('400')

		article.remove()
	})
})

describe('association-list alignment', () => {
	const settle = async () => {
		for (let frame = 0; frame < 3; frame++) await new Promise(resolve => requestAnimationFrame(resolve))
	}

	async function mountMarkdownEditor(source: string) {
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		await settle()
		const valueLeft = (text: string) => textLeft(
			Array.from(root.querySelectorAll('.association-list-value-content')).find(value => value.textContent === text),
			text
		)
		return { editor, root, article, valueLeft }
	}

	test('aligns association lists separated only by blank lines', async () => {
		const { article, valueLeft } = await mountMarkdownEditor('- x :: one\n\n- a longer term :: two')

		expect(valueLeft('one')).toBeCloseTo(valueLeft('two'), 0)
		article.remove()
	})

	test('joins a run across a whitespace-only line', async () => {
		const { article, valueLeft } = await mountMarkdownEditor('- x :: one\n\t\n- a longer term :: two')

		expect(valueLeft('one')).toBeCloseTo(valueLeft('two'), 0)
		article.remove()
	})

	test('aligns blockquoted association lists separated by a blank quote line', async () => {
		const { article, valueLeft } = await mountMarkdownEditor('> - x :: one\n>\n> - a longer term :: two')

		expect(valueLeft('one')).toBeCloseTo(valueLeft('two'), 0)
		article.remove()
	})

	test('aligns each depth across a run', async () => {
		const { root, article } = await mountMarkdownEditor(`- a :: first
  - b :: nested one

- a :: second
  - a longer nested term :: nested two`)
		const lefts = Array.from(root.querySelectorAll('.association-list-value-content'), value =>
			value.getBoundingClientRect().left)

		expect(lefts[0]).toBeCloseTo(lefts[2], 0)
		expect(lefts[1]).toBeCloseTo(lefts[3], 0)
		article.remove()
	})

	test('keeps lists separated by other lines independent', async () => {
		const { article, valueLeft } = await mountMarkdownEditor('- x :: one\nparagraph\n- a longer term :: two')

		expect(valueLeft('one')).toBeLessThan(valueLeft('two'))
		article.remove()
	})

	test('does not move other blocks while a term is revealed', async () => {
		const source = '- x :: one\n\n- a longer term :: two\n\nplain'
		const { editor, article, valueLeft } = await mountMarkdownEditor(source)
		const aligned = valueLeft('one')

		editor.select(source.indexOf('- a longer'))
		await settle()
		expect(article.querySelector('.association-list-line.revealed')).not.toBeNull()
		expect(valueLeft('one')).toBeCloseTo(aligned, 0)
		article.remove()
	})
	test('normalizes rendered whitespace without changing source', async () => {
		const source = '- alpha   beta    ::   one   two\n\n- alpha beta :: one two'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		await wait(30)
		const terms = Array.from(root.querySelectorAll('.association-list-term-content')) as HTMLElement[]
		expect(terms[0].getBoundingClientRect().width).toBeCloseTo(terms[1].getBoundingClientRect().width, 0)
		const values = Array.from(root.querySelectorAll('.association-list-value-content'))
		expect(textLeft(values[0], 'one')).toBeCloseTo(textLeft(values[1], 'one'), 0)
		expect(getComputedStyle(terms[0]).color).toBe(getComputedStyle(root).color)
		expect(parseFloat(getComputedStyle(values[0]).fontSize)).toBeLessThan(parseFloat(getComputedStyle(terms[0]).fontSize))
		const restored = deltaFromDom(editor, { collapseWhitespace: false })
		expect(restored.ops.map(op => op.insert).join('')).toBe(source + '\n')
		editor.select(source.indexOf('alpha'))
		await wait()
		expect(getComputedStyle(root.querySelector('.association-list-term')).whiteSpace).toBe('pre-wrap')
		expect(editor.doc.lines.map(line => line.content.ops.map(op => op.insert).join('')).join('\n')).toBe(source)
		article.remove()
	})

	test('summarizes folded descendants without extra source text and restores their rows', async () => {
		const source = '- term ::\n  - **first** value\n  - second value $x$\nplain'
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		const summary = root.querySelector('.association-list-summary')
		expect(summary.getAttribute('data-summary')).toBe('first value · second value x')
		expect(summary.textContent).toBe('')
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(root.querySelector('.association-list-summary')).toBeNull()
		expect(Array.from(root.querySelectorAll('.association-list-value')).every(line => getComputedStyle(line).display !== 'none')).toBe(true)
		article.remove()
	})

	test('preserves an authored nonbreaking space in the rendered term and document', () => {
		const source = '- non\u00a0breaking :: value'
		const { editor, root } = createEditor(source)
		expect(root.querySelector('.association-list-term-content').textContent).toContain('non\u00a0breaking')
		expect(editor.doc.lines[0].content.ops.map(op => op.insert).join('')).toBe(source)
	})

})

describe('shared term and value geometry', () => {
	test.each([
		'- first ::\n- second :: inline value\n\t- another value\n- next :: final',
		'- first ::\n- second ::\n\t- value one\n\t- value two\n- next :: final',
		'- parent ::\n\t- first ::\n\t- second :: inline value\n\t\t- another value\n- next :: final'
	])('starts the columns together without hiding editable terms: %s', async source => {
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		article.style.width = '500px'
		try {
			await wait(30)
			const terms = Array.from(root.querySelectorAll<HTMLElement>('.association-list-term-content'))
			const first = terms.find(term => term.textContent.includes('first'))
			const second = terms.find(term => term.textContent.includes('second'))
			const value = Array.from(root.querySelectorAll<HTMLElement>('.association-list-value-content, .association-list-value')).find(element => element.textContent.includes('value'))
			expect(value.getBoundingClientRect().top).toBeCloseTo(first.getBoundingClientRect().top, 0)
			expect(second.getBoundingClientRect().top).toBeGreaterThan(first.getBoundingClientRect().top)
			expect(getLineBounds(second.parentElement).top).toBeCloseTo(second.getBoundingClientRect().top, 0)
			for (const term of [first, second]) {
				const rect = term.getBoundingClientRect()
				expect(term.contains(document.elementFromPoint(rect.left + 2, rect.top + 2))).toBe(true)
			}
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		} finally { editor.destroy(); article.remove() }
	})
})

describe('Association List bar controls', () => {
	test.each([
		'- first ::\n- second :: inline\n\t- more\n- other :: remains',
		'- first ::\n- second ::\n\t- value\n\t- more\n- other :: remains',
		'- parent ::\n\t- child :: nested\n\t\t- more\n- other :: remains'
	])('shares persisted gutter folding without source text: %s', async source => {
		const { editor, root } = createMarkdownEditor(source)
		const article = mountInNote(root)
		const { WritableStore } = await import('common/stores')
		const collapsed = new WritableStore<number[]>([])
		editor.collapsingSections.setCollapsedStateStore(collapsed)
		try {
			const bar = () => root.querySelector<HTMLElement>('.association-list-collapse-bar')
			const ownerId = bar().dataset.associationListOwner
			const ownerIndex = editor.doc.lines.findIndex(line => line.id === ownerId)
			bar().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
			bar().click()
			await wait(20)
			expect(collapsed.value).toContain(ownerIndex)
			expect(bar().getAttribute('aria-expanded')).toBe('false')
			expect(bar().textContent).toBe('')
			expect(getComputedStyle(bar(), '::before').content).toBe('none')
			const preview = root.querySelector('.folded-text')
			expect(getComputedStyle(preview.querySelector('.folded-text-marker'), '::after').content).toBe('"⋯"')
			expect(getComputedStyle(preview.querySelector('.folded-text-content')).maskImage).toContain('linear-gradient')
			expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
			bar().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
			await wait(20)
			expect(collapsed.value ?? []).not.toContain(ownerIndex)
			editor.collapsingSections.toggleLineCollapsed(ownerIndex)
			await wait(20)
			expect(bar().getAttribute('aria-expanded')).toBe('false')
			bar().click()
			expect(collapsed.value ?? []).not.toContain(ownerIndex)
			expect(editor.getText()).toBe(source)
		} finally { editor.destroy(); article.remove() }
	})
})

test('a wrapped inline value uses the group height once', async () => {
	const source = '- first ::\n- second :: ' + 'a long value that wraps in a proportional font '.repeat(8) + '\n- next :: final'
	const { editor, root } = createMarkdownEditor(source)
	const article = mountInNote(root)
	article.style.cssText = 'width:500px;font-family:serif;'
	try {
		await wait(30)
		const terms = Array.from(root.querySelectorAll<HTMLElement>('.association-list-term-content'))
		const value = root.querySelector<HTMLElement>('.association-list-value-content')
		const range = document.createRange()
		range.selectNodeContents(value)
		const textHeight = range.getBoundingClientRect().height
		const termHeight = terms[0].getBoundingClientRect().height + terms[1].getBoundingClientRect().height
		const start = terms[0].getBoundingClientRect().top
		expect(terms[2].getBoundingClientRect().top - start).toBeLessThanOrEqual(Math.max(textHeight, termHeight) + 5)
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
	} finally { editor.destroy(); article.remove() }
})

test.each([
	'first ::\nsecond ::\n: value one\n: value two\nplain',
	'parent ::\n\tfirst ::\n\tsecond ::\n\t: value one\n\t: value two\nplain',
	'first ::\n- second :: value one\n\t- value two\nplain'
])('portable shared groups align and retain bar ownership: %s', async source => {
	const { editor, root } = createMarkdownEditor(source)
	const article = mountInNote(root)
	try {
		await wait(20)
		const term = Array.from(root.querySelectorAll<HTMLElement>('.association-list-term-content')).find(element => element.textContent.includes('first'))
		const value = root.querySelector<HTMLElement>('.association-list-value, .association-list-value-content')
		expect(value.getBoundingClientRect().top).toBeCloseTo(term.getBoundingClientRect().top, 0)
		const bar = value.querySelector<HTMLElement>('.association-list-collapse-bar')
		const owner = editor.doc.lines.findIndex(line => line.id === bar.dataset.associationListOwner)
		bar.click()
		await wait(20)
		expect(editor.collapsingSections.lineHasCollapsedChildren(owner)).toBe(true)
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
		editor.collapsingSections.toggleLineCollapsed(owner)
		expect(editor.getText()).toBe(source)
	} finally { editor.destroy(); article.remove() }
})
