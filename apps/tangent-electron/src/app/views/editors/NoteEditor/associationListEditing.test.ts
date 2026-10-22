import { afterEach, describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { wait } from '@such-n-such/core'
import { deltaFromDom, docToHTML, Source } from 'typewriter-editor'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import { getLineBounds } from './lineGeometry'
import '../../../../../static/global.css'
import 'app/style/note.scss'

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup() })

function setup(source: string, width = 850) {
	const article = document.createElement('article')
	article.className = 'note'
	article.style.cssText = `width:${width}px;box-sizing:border-box`
	const root = document.createElement('div')
	root.style.whiteSpace = 'pre-wrap'
	article.append(root)
	document.body.append(article)
	const editor = new MarkdownEditor(null, { root, doc: markdownToTextDocument(source) })
	cleanups.push(() => { editor.destroy(); article.remove() })
	const blocks = () => Array.from(root.querySelectorAll<HTMLElement>('.editor-association-list'))
	const lines = () => Array.from(root.querySelectorAll<HTMLElement>('.association-list-line'))
	const caretLine = () => editor.doc.lines.indexOf(editor.doc.getLineAt(editor.doc.selection[1]))
	const sourceText = () => deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')
	return { editor, root, article, blocks, lines, caretLine, sourceText }
}

describe('Association List soft reveal', () => {
	test('keeps one source line in native flow for Down, Up, Home, End and selection', async () => {
		const source = 'Before\n- Alpha :: first value\n- Beta :: second value\nAfter'
		const { editor, blocks, lines, caretLine, sourceText } = setup(source)
		expect(getComputedStyle(blocks()[0]).display).toBe('grid')
		editor.select(source.indexOf('Alpha') + 2)
		await wait()
		expect(getComputedStyle(blocks()[0]).display).toBe('block')
		expect(lines().map(line => getComputedStyle(line).display)).toEqual(['block', 'block'])
		const term = lines()[0].querySelector('.association-list-term-content')
		const value = lines()[0].querySelector('.association-list-value-content')
		expect(Math.abs(term.getBoundingClientRect().top - value.getBoundingClientRect().top)).toBeLessThan(4)
		await userEvent.keyboard('{ArrowDown}')
		await expect.poll(caretLine).toBe(2)
		await userEvent.keyboard('{ArrowUp}')
		await expect.poll(caretLine).toBe(1)
		await userEvent.keyboard('{End}')
		await expect.poll(() => editor.doc.selection).toEqual([source.indexOf('\n- Beta'), source.indexOf('\n- Beta')])
		await userEvent.keyboard('{Home}')
		await expect.poll(() => editor.doc.selection).toEqual([source.indexOf('Alpha'), source.indexOf('Alpha')])
		await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')
		await expect.poll(caretLine).toBe(2)
		expect(editor.doc.selection[0]).toBe(source.indexOf('Alpha'))
		expect(sourceText()).toBe(source + '\n')
		editor.select(source.length)
		expect(getComputedStyle(blocks()[0]).display).toBe('grid')
	})

	test('reveals only touched blocks and temporarily exposes folds without changing flags', async () => {
		const source = '- Group ::\n  - first\n  - second\n\n- Other :: value\nAfter'
		const { editor, blocks, lines, sourceText } = setup(source)
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		const folded = editor.doc.lines.map(line => line.attributes.collapsed)
		expect(getComputedStyle(lines()[1]).display).toBe('none')
		editor.select(source.indexOf('Group'))
		await wait()
		expect(blocks().map(block => block.classList.contains('association-list-editing'))).toEqual([true, false])
		expect(lines().slice(0, 3).every(line => getComputedStyle(line).display === 'block')).toBe(true)
		expect(getComputedStyle(blocks()[0].querySelector('.association-list-summary')).display).toBe('none')
		expect(editor.doc.lines.map(line => line.attributes.collapsed)).toEqual(folded)
		editor.select([source.indexOf('Group'), source.indexOf('Other')])
		expect(blocks().every(block => block.classList.contains('association-list-editing'))).toBe(true)
		editor.select(source.length)
		await wait()
		expect(getComputedStyle(lines()[1]).display).toBe('none')
		expect(editor.doc.lines.map(line => line.attributes.collapsed)).toEqual(folded)
		expect(sourceText()).toBe(source + '\n')
	})

	test('keeps inline formatting, source offsets, semantic export and user stylesheet access', async () => {
		const source = '- **Alpha** :: `code` and {word::meaning}\n  - Child :: $x^2$\nAfter'
		const { editor, root, blocks, sourceText } = setup(source)
		editor.select(source.indexOf('Alpha') + 2)
		await wait()
		expect(root.querySelector('strong')).not.toBeNull()
		expect(root.querySelector('code.inline_code')).not.toBeNull()
		expect(root.querySelector('t-gloss')).not.toBeNull()
		const style = document.createElement('style')
		style.textContent = '.association-list-editing .association-list-term-content { text-decoration-line: overline; }'
		document.head.append(style)
		try {
			expect(getComputedStyle(root.querySelector('.association-list-term-content')).textDecorationLine).toBe('overline')
			expect(docToHTML(editor, editor.doc)).toContain('<dl')
			expect(docToHTML(editor, editor.doc)).not.toContain('association-list-editing')
			expect(editor.doc.lines.some(line => line.attributes.associationListEditing)).toBe(false)
			expect(sourceText()).toBe(source + '\n')
			editor.enabled = false
			editor.select(source.indexOf('Child'), Source.api)
			expect(blocks()[0].classList.contains('association-list-editing')).toBe(false)
		} finally { style.remove() }
	})

	test('preserves the clicked source position when reading geometry changes', async () => {
		const source = '- Alpha :: first value\n- Beta :: second value\nAfter'
		const { editor, root, blocks, sourceText } = setup(source)
		await page.elementLocator(root.querySelectorAll('.association-list-value-content')[1]).click()
		await expect.poll(() => blocks()[0].classList.contains('association-list-editing')).toBe(true)
		const selection = editor.doc.selection[1]
		expect(selection).toBeGreaterThanOrEqual(source.indexOf('second'))
		expect(selection).toBeLessThanOrEqual(source.indexOf('\nAfter'))
		await userEvent.keyboard('!')
		await expect.poll(sourceText).toBe(source.slice(0, selection) + '!' + source.slice(selection) + '\n')
		editor.modules.history.undo()
		expect(editor.getText()).toBe(source)
		expect(sourceText()).toBe(source + '\n')
	})

	test.each(['`code`', '$x^2$', '{base::meaning}'])('uses native line boundaries around rich inline content: %s', async inline => {
		const source = `Before\n- Alpha :: start ${inline} finish\n- Beta :: next\nAfter`
		const { editor, caretLine, sourceText } = setup(source)
		editor.select(source.indexOf('start') + 1)
		await userEvent.keyboard('{End}')
		const end = source.indexOf('\n- Beta')
		await expect.poll(() => editor.doc.selection).toEqual([end, end])
		await userEvent.keyboard('{ArrowDown}')
		await expect.poll(caretLine).toBe(2)
		editor.select(source.indexOf(inline) + 2)
		await userEvent.keyboard('{End}')
		await expect.poll(() => editor.doc.selection).toEqual([end, end])
		expect(sourceText()).toBe(source + '\n')
	})

	test('wraps within a source line and keeps Home/End on the visual line', async () => {
		const source = '- Alpha :: A long value that wraps across several visual lines within the editable note width.\n- Beta :: next\nAfter'
		const { editor, lines, caretLine, sourceText } = setup(source, 310)
		editor.select(source.indexOf('Alpha') + 1)
		await wait()
		const lineHeight = parseFloat(getComputedStyle(lines()[0]).lineHeight)
		expect(getLineBounds(lines()[0]).height).toBeGreaterThan(2 * lineHeight)
		await userEvent.keyboard('{ArrowDown}')
		await expect.poll(caretLine).toBe(0)
		const middle = editor.doc.selection[1]
		expect(middle).toBeGreaterThan(source.indexOf('value'))
		await userEvent.keyboard('{Home}')
		const start = editor.doc.selection[1]
		expect(start).toBeGreaterThan(2)
		expect(start).toBeLessThanOrEqual(middle)
		await userEvent.keyboard('{End}')
		expect(editor.doc.selection[1]).toBeGreaterThan(start)
		expect(editor.doc.selection[1]).toBeLessThan(source.indexOf('\n- Beta'))
		expect(sourceText()).toBe(source + '\n')
	})

	test('keeps nested and shared terms in source order and restores reading layout after edits', async () => {
		const source = '- uses ::\n- requires ::\n\t- first\n\t- Child :: value\nAfter'
		const { editor, blocks, lines, caretLine, sourceText } = setup(source)
		editor.select(source.indexOf('uses') + 1)
		await userEvent.keyboard('{ArrowDown}')
		await expect.poll(caretLine).toBe(1)
		await userEvent.keyboard('{ArrowDown}')
		await expect.poll(caretLine).toBe(2)
		expect(lines().every((line, index, all) => !index || getLineBounds(line).top >= getLineBounds(all[index - 1]).bottom)).toBe(true)
		editor.select(source.indexOf('Child') + 5)
		await userEvent.keyboard('{Enter}')
		await expect.poll(() => editor.getText()).toContain('\t- Child\n\t-  :: value')
		editor.modules.history.undo()
		expect(editor.getText()).toBe(source)
		editor.select(source.indexOf('Child'))
		await userEvent.keyboard('{Tab}')
		expect(editor.getText()).toBe(source.replace('\t- Child', '\t\t- Child'))
		await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
		expect(editor.getText()).toBe(source)
		editor.select(source.indexOf(' ::', source.indexOf('Child')))
		editor.change.delete([source.indexOf(' ::', source.indexOf('Child')), source.indexOf('value')]).apply()
		await wait()
		expect(sourceText()).toBe(editor.getText() + '\n')
		editor.modules.history.undo()
		expect(editor.getText()).toBe(source)
		editor.select(source.length)
		expect(getComputedStyle(blocks()[0]).display).toBe('grid')
	})

	test('keeps folds usable while editing and re-enters source flow from a collapsed summary', async () => {
		const source = '- Group ::\n  - first\n  - second\nAfter'
		const { editor, root, blocks, lines, sourceText } = setup(source)
		editor.select(source.indexOf('Group'))
		editor.collapsingSections.toggleLineCollapsed(0)
		await wait()
		expect(getComputedStyle(blocks()[0]).display).toBe('grid')
		expect(getComputedStyle(lines()[1]).display).toBe('none')
		await page.elementLocator(root.querySelector('.association-list-summary-text')).click()
		await expect.poll(() => blocks()[0].classList.contains('association-list-editing')).toBe(true)
		expect(lines().every(line => getComputedStyle(line).display === 'block')).toBe(true)
		expect(editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(true)
		editor.select(source.length)
		expect(getComputedStyle(lines()[1]).display).toBe('none')
		expect(sourceText()).toBe(source + '\n')
	})

	test('keeps blockquote prefixes visible and honors document-boundary modifiers', async () => {
		const source = 'Before\n> - Alpha :: first\n>   - Child :: second\nAfter'
		const { editor, root, blocks, sourceText } = setup(source)
		editor.select(source.indexOf('Child'))
		await wait()
		for (const prefix of root.querySelectorAll<HTMLElement>('.association-list-line .line_format')) {
			expect(parseFloat(getComputedStyle(prefix).fontSize)).toBeGreaterThan(0)
		}
		await userEvent.keyboard('{Control>}{End}{/Control}')
		await expect.poll(() => editor.doc.selection).toEqual([source.length, source.length])
		expect(getComputedStyle(blocks()[0]).display).toBe('grid')
		await userEvent.keyboard('{Control>}{Home}{/Control}')
		await expect.poll(() => editor.doc.selection).toEqual([0, 0])
		expect(sourceText()).toBe(source + '\n')
	})

})
