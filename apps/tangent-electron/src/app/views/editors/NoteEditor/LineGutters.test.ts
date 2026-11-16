import { afterEach, describe, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { wait } from '@such-n-such/core'
import { flushSync, mount, unmount } from 'svelte'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import { isLineCollapsed } from 'common/markdownModel/sections'
import { WritableStore } from 'common/stores'
import './t-embed'
import MarkdownEditor from './MarkdownEditor'
import LineGutters from './LineGutters.svelte'
import { getLineBounds } from './lineGeometry'
import { deltaFromDom } from 'typewriter-editor'
import '../../../../../static/global.css'
import 'app/style/note.scss'
import 'app/style/input.scss'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

function setup(source: string) {
	const container = document.createElement('div')
	container.style.cssText = 'position:relative;margin:30px;width:800px;padding:0 100px;box-sizing:border-box'
	const article = document.createElement('article')
	article.className = 'note'
	const root = document.createElement('div')
	article.append(root)
	const target = document.createElement('div')
	container.append(article, target)
	document.body.append(container)
	const editor = new MarkdownEditor(null, { root, doc: markdownToTextDocument(source) })
	const collapsed = new WritableStore<number[]>([])
	editor.collapsingSections.setCollapsedStateStore(collapsed)
	let gutterWidth = 32
	let component
	flushSync(() => { component = mount(LineGutters, { target, props: { editor, container, onWidth: width => gutterWidth = width } }) })
	cleanups.push(async () => { await unmount(component); editor.destroy(); container.remove() })
	const terms = () => Array.from(root.querySelectorAll<HTMLElement>('.association-list-term-content'))
	const buttons = () => Array.from(target.querySelectorAll<HTMLButtonElement>('[data-line-gutter="left"] button'))
	return { editor, root, target, container, collapsed, terms, buttons, gutterWidth: () => gutterWidth }
}

describe('Association List gutter access', () => {
	test.each(['', 'inline value'])('anchors a shared group at its first term with a full-height hover target: %s', async inline => {
		const source = `- uses ::\n- requires :: ${inline}\n  - npm\n  - typescript\n  - electron\n- other :: remains`
		const { editor, root, terms, buttons, collapsed } = setup(source)
		await page.elementLocator(terms()[0]).hover()
		await wait(30)
		expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Collapse requires'])
		const owner = terms()[1].parentElement
		const group = getLineBounds(owner)
		const button = buttons()[0]
		expect(button.getBoundingClientRect().top).toBeCloseTo(terms()[0].getBoundingClientRect().top, 0)
		expect(button.getBoundingClientRect().height).toBeCloseTo(group.height, 0)
		const icon = button.querySelector('svg').getBoundingClientRect()
		expect(icon.top + icon.height / 2).toBeCloseTo(group.top + parseFloat(getComputedStyle(owner).lineHeight) / 2, 0)
		await page.elementLocator(button).hover({ position: { x: 5, y: button.clientHeight - 4 } })
		await expect.poll(() => getComputedStyle(button).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
		expect(buttons()).toHaveLength(1)
		await page.elementLocator(button).click()
		await wait()
		expect(collapsed.value).toEqual([1])
		const summary = root.querySelector<HTMLElement>('.association-list-summary, .association-list-value-content')
		expect(summary.getBoundingClientRect().top).toBeCloseTo(terms()[0].getBoundingClientRect().top, 0)
		expect(terms()[1].getBoundingClientRect().top).toBeGreaterThan(terms()[0].getBoundingClientRect().top)
		expect(buttons()[0].getBoundingClientRect().top).toBeCloseTo(terms()[0].getBoundingClientRect().top, 0)
		await page.elementLocator(terms()[2]).hover()
		await wait(30)
		expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Collapse other'])
		expect(editor.getText()).toBe(source)
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
	})

	test('gives overlapping nested terms independent controls and preserves ancestor and sibling state', async () => {
		const source = '- Parent ::\n  - Child ::\n    - Grandchild :: First value\n    - Sibling :: Second value\n- Other :: Third value'
		const { editor, root, collapsed, terms, buttons, gutterWidth } = setup(source)
		await page.elementLocator(terms()[0]).hover()
		await wait(30)
		expect(gutterWidth()).toBe(80)
		expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual([
			'Collapse Parent', 'Collapse Child', 'Collapse Grandchild'
		])
		const bounds = buttons().map(button => button.getBoundingClientRect())
		for (let i = 1; i < bounds.length; i++) expect(bounds[i - 1].right).toBeLessThanOrEqual(bounds[i].left)
		await page.getByRole('button', { name: 'Collapse Grandchild', exact: true }).click()
		await wait()
		expect(collapsed.value).toEqual([2])
		expect(editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(false)
		expect(editor.collapsingSections.lineHasCollapsedChildren(1)).toBe(false)
		expect(isLineCollapsed(editor.doc.lines[3])).toBe(false)
		await page.getByRole('button', { name: 'Collapse Child', exact: true }).click()
		await wait()
		expect(editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(false)
		expect(editor.collapsingSections.lineHasCollapsedChildren(1)).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[2])).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[3])).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[4])).toBe(false)
		expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Collapse Parent', 'Expand Child'])
		expect(gutterWidth()).toBe(56)
		await page.getByRole('button', { name: 'Expand Child', exact: true }).click()
		await wait()
		expect(editor.collapsingSections.lineHasCollapsedChildren(2)).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[2])).toBe(false)
		expect(isLineCollapsed(editor.doc.lines[3])).toBe(false)
		expect(editor.getText()).toBe(source)
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
	})

	test('finds later child rows without letting a spanning parent claim their hover', async () => {
		const { root, terms, buttons } = setup('- Parent ::\n  - First :: one\n  - Second :: two\n  - Third :: three')
		const parent = terms()[0].parentElement
		const last = terms()[3]
		expect(parent.getBoundingClientRect().bottom).toBeGreaterThan(last.getBoundingClientRect().top)
		expect(getLineBounds(parent).bottom).toBeLessThan(last.getBoundingClientRect().top)
		await page.elementLocator(last).hover()
		await wait(30)
		expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Collapse Third'])
		const bar = root.querySelectorAll('.association-list-value-content')[2]
		expect(bar).toBeTruthy()
		await page.getByRole('button', { name: 'Collapse Third', exact: true }).click()
		expect(buttons()[0].getAttribute('aria-label')).toBe('Expand Third')
	})

	test('exposes a value with ordinary list children independently of its term', async () => {
		const source = '- Parent ::\n  - Value\n    - Child'
		const { editor, root, buttons } = setup(source)
		await page.elementLocator(root.querySelector('.association-list-value')).hover({ position: { x: 20, y: 5 } })
		await wait(30)
		await page.getByRole('button', { name: 'Collapse this section', exact: true }).click()
		await wait()
		expect(editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(false)
		expect(editor.collapsingSections.lineHasCollapsedChildren(1)).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[2])).toBe(true)
		expect(buttons().length).toBeGreaterThan(0)
	})

	test.runIf(!!markdownToTextDocument('Parent ::').lines[0].attributes.associationList)('folds a nested colon term without folding its parent or sibling', async () => {
		const source = 'Root ::\n: Child ::\n  : Leaf ::\n    : Value\n: Sibling ::\n  : Remains'
		const { editor, root, terms, buttons } = setup(source)
		await page.elementLocator(terms()[0]).hover()
		await wait(30)
		expect(buttons().map(button => button.getAttribute('aria-label'))).toEqual(['Collapse Root', 'Collapse Child', 'Collapse Leaf'])
		await page.getByRole('button', { name: 'Collapse Leaf', exact: true }).click()
		await wait()
		expect(editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(false)
		expect(editor.collapsingSections.lineHasCollapsedChildren(1)).toBe(false)
		expect(isLineCollapsed(editor.doc.lines[3])).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[4])).toBe(false)
		await page.getByRole('button', { name: 'Collapse Child', exact: true }).click()
		await wait()
		expect(editor.collapsingSections.lineHasCollapsedChildren(0)).toBe(false)
		expect(isLineCollapsed(editor.doc.lines[2])).toBe(true)
		expect(isLineCollapsed(editor.doc.lines[4])).toBe(false)
		expect(isLineCollapsed(editor.doc.lines[5])).toBe(false)
		expect(deltaFromDom(editor, { collapseWhitespace: false }).ops.map(op => op.insert).join('')).toBe(source + '\n')
	})

	test('preserves the single collapse and copy gutters for ordinary sections', async () => {
		const { root, target, buttons } = setup('# Heading\n\nParagraph\n- Item')
		const heading = root.querySelector<HTMLElement>('.line')
		await page.elementLocator(heading).hover({ position: { x: 10, y: 5 } })
		await wait(30)
		expect(buttons()).toHaveLength(1)
		expect(target.querySelectorAll('[data-line-gutter="right"] button')).toHaveLength(0)
		await page.elementLocator(heading).hover({ position: { x: heading.clientWidth - 5, y: 5 } })
		await wait(30)
		expect(buttons()).toHaveLength(0)
		expect(target.querySelectorAll('[data-line-gutter="right"] button')).toHaveLength(1)
	})
})
