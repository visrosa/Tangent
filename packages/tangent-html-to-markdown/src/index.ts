import { repeatString } from '@such-n-such/core'
import { anyChild } from '@such-n-such/core-browser'
import TurndownService from 'turndown'
import { gridTableToMarkdown } from './gridTable'
import type { TableCell, TableModel, TableAlignment } from './tableModel'

export type { TableModel, TableRow, TableCell, TableAlignment } from './tableModel'

const headernames = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6']
const blocknames = ['P', 'UL', 'OL', ...headernames]

function getBlockContainers(node: HTMLElement, options) {
	let prefix = '\n\n'
	let suffix = '\n\n'

	if (options.googleDoc) {
		if (node.style.marginTop === '0pt') {
			prefix = '\n'
		}
		if (node.style.marginBottom === '0pt') {
			suffix = '\n'
		}
	}

	return { prefix, suffix }
}

function cleanPlaceholders(text: string) {
	return text.replace(/<br>/g, '')
}

let turndown = null
const tableRows = new WeakMap<HTMLTableElement, Map<HTMLElement, string>>()
const gridTables = new WeakMap<HTMLTableElement, string | null>()

function gridTableFromHTML(table: HTMLTableElement): string | null {
	if (gridTables.has(table)) return gridTables.get(table)
	const rows = Array.from(table.rows)
	const coordinates: { cell: TableCell, origin: boolean }[][] = rows.map(() => [])
	const model: TableModel = { columns: [], head: [], body: [], foot: [] }
	let needsGrid = false
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex]
		let groupEnd = rowIndex + 1
		while (groupEnd < rows.length && rows[groupEnd].parentElement === row.parentElement) groupEnd++
		let column = 0
		for (const node of Array.from(row.cells)) {
			while (coordinates[rowIndex][column]) column++
			const rowSpan = node.rowSpan === 0 ? groupEnd - rowIndex : Math.min(node.rowSpan, groupEnd - rowIndex)
			const columnSpan = node.colSpan
			const markdown = cleanPlaceholders(getTurndown().turndown(node.innerHTML)).trim()
			needsGrid ||= rowSpan > 1 || columnSpan > 1 || markdown.includes('\n') || !!node.querySelector('p, div, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, hr, table')
			const alignment = node.style.textAlign || node.getAttribute('align')
			const cell: TableCell = { markdown, contentType: 'block', rowSpan, columnSpan }
			if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
				model.columns[column] ??= { alignment: alignment as TableAlignment }
			}
			for (let r = rowIndex; r < rowIndex + rowSpan; r++) {
				for (let c = column; c < column + columnSpan; c++) {
					coordinates[r][c] = { cell, origin: r === rowIndex && c === column }
				}
			}
			column += columnSpan
		}
	}
	if (!needsGrid) { gridTables.set(table, null); return null }
	const width = Math.max(1, ...coordinates.map(row => row.length))
	model.columns = Array.from({ length: width }, (_, column) => model.columns[column] ?? { alignment: null })
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const cells: TableCell[] = []
		for (let column = 0; column < width; column++) {
			const coordinate = coordinates[rowIndex][column]
			if (coordinate?.origin) cells.push(coordinate.cell)
			else if (!coordinate) cells.push({ markdown: '', contentType: 'block', rowSpan: 1, columnSpan: 1 })
		}
		const section = rows[rowIndex].parentElement.nodeName === 'THEAD' ? model.head : rows[rowIndex].parentElement.nodeName === 'TFOOT' ? model.foot : model.body
		section.push({ cells })
	}
	if (table.caption) model.caption = { markdown: cleanPlaceholders(getTurndown().turndown(table.caption.innerHTML)).trim(), contentType: 'inline' }
	const result = gridTableToMarkdown(model)
	gridTables.set(table, result)
	return result
}

function tableCellToMarkdown(cell: Element): string {
	return getTurndown().turndown(cell.innerHTML)
		.replace(/\r?\n/g, ' ')
		.replace(/(\\*)\|/g, (match, backslashes) => backslashes + (backslashes.length % 2 === 0 ? '\\' : '') + '|')
		.trim()
}

function getTableRows(table: HTMLTableElement): Map<HTMLElement, string> {
	let result = tableRows.get(table)
	if (result) return result
	const rows = Array.from(table.rows)
	const grid: string[][] = rows.map(() => [])
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
		const row = rows[rowIndex]
		let groupEnd = rowIndex + 1
		while (groupEnd < rows.length && rows[groupEnd].parentElement === row.parentElement) groupEnd++
		let column = 0
		for (const cell of Array.from(row.cells)) {
			while (grid[rowIndex][column] !== undefined) column++
			const rowSpan = cell.rowSpan === 0 ? groupEnd - rowIndex : Math.min(cell.rowSpan, groupEnd - rowIndex)
			// Pipe syntax has no spans: reserve covered coordinates without duplicating content.
			for (let rowOffset = 0; rowOffset < rowSpan; rowOffset++) {
				for (let columnOffset = 0; columnOffset < cell.colSpan; columnOffset++) {
					grid[rowIndex + rowOffset][column + columnOffset] = ''
				}
			}
			grid[rowIndex][column] = tableCellToMarkdown(cell)
			column += cell.colSpan
		}
	}
	const width = Math.max(1, ...grid.map(row => row.length))
	result = new Map()
	for (let index = 0; index < rows.length; index++) {
		const cells = Array.from({ length: width }, (_, column) => grid[index][column] ?? '')
		let markdown = '| ' + cells.join(' | ') + ' |\n'
		if (rows[index].parentElement?.nodeName === 'THEAD' && !rows[index].nextElementSibling) {
			markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n'
		}
		result.set(rows[index], markdown)
	}
	tableRows.set(table, result)
	return result
}

function tableRowToMarkdown(node: HTMLElement): string {
	const table = node.closest('table')
	return table ? getTableRows(table).get(node) ?? '' : ''
}

function getTurndown() {
	if (turndown === null) {
		turndown = new TurndownService({
			headingStyle: 'atx',
			hr: '---',
			codeBlockStyle: 'fenced',
			blankReplacement: function (content: string, node: HTMLElement & { isBlock: boolean }) {
				// Blank-node handling precedes rules, including rows of empty cells.
				if (node.nodeName === 'TR') return tableRowToMarkdown(node)
				if (node.nodeName === 'TABLE') {
					const table = node as HTMLTableElement & { isBlock: boolean }
					const rows = gridTableFromHTML(table) ?? Array.from(getTableRows(table).values()).join('')
					return '\n\n' + rows + '\n\n'
				}
				if (node.nodeName === 'THEAD' || node.nodeName === 'TBODY' || node.nodeName === 'TFOOT') return content
				return node.isBlock ? '\n\n' : ''
			}
		})

		// Copy/pasted so that headers don't have trailing blank lines
		turndown.addRule('paragraph', {
			filter: 'p',

			replacement (content, node: HTMLElement, options) {
				if (cleanPlaceholders(content).trim() === '') return ''

				let { prefix, suffix } = getBlockContainers(node, options)

				if (node.previousSibling?.nodeName.match(/h\d+/i)) {
					// Following a header
					prefix = '\n'
				}

				return prefix + content + suffix
			}
		})
		turndown.addRule('heading', {
			filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],

			replacement: function (content, node: Node, options) {
				var hLevel = Number(node.nodeName.charAt(1))

				if (options.headingStyle === 'setext' && hLevel < 3) {
					var underline = repeatString((hLevel === 1 ? '=' : '-'), content.length)
					return (
						'\n\n' + content + '\n' + underline + '\n'
					)
				} else {
					return '\n\n' + repeatString('#', hLevel) + ' ' + content + '\n'
				}
			}
		})

		turndown.addRule('list', {
			filter: ['ul', 'ol'],

			replacement: function (content, node: HTMLElement, options) {
				var parent = node.parentNode
				let { prefix, suffix } = getBlockContainers(node, options)

				if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
					prefix = '\n'
					suffix = ''
				}
				else {
					prefix = '\n'
					suffix = '\n'
				}

				return prefix + content + suffix
			}
		})

		// Copy/pasted this to reduce the number of trailing spaces
		turndown.addRule('list-item', {
			filter: 'li',
	
			replacement: function (content, node: Node, options) {
				var prefix = options.bulletListMarker + ' '
				var parent = node.parentNode

				content = content
					.replace(/^\n+/, '') // remove leading newlines
					.replace(/\n+$/, '') // replace trailing newlines with just a single one
					.replace(/\n/gm, '\n\t') // indent

				if (parent.nodeName === 'OL') {
					var start = (parent as HTMLElement).getAttribute('start')
					var index = Array.prototype.indexOf.call(parent.children, node)
					prefix = (start ? Number(start) + index : index + 1) + '. '
				}
				return (
					prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '')
				)
			}
		})

		// Customized to remove bold/italic wrappers around an entire document (thanks google docs, very cool)
		turndown.addRule('emphasis', {
			filter: ['em', 'i'],

			replacement: function (content, node, options) {
				if (!content.trim()) return ''
				if (anyChild(node.childNodes, n => blocknames.includes(n.nodeName))) {
					// An italic wrapper around block level elements makes no sense
					return content
				}
				return options.emDelimiter + content + options.emDelimiter
			}
		})
		turndown.addRule('strong', {
			filter: ['strong', 'b'],

			replacement: function (content, node: Node, options) {
				if (!content.trim()) return ''
				if (anyChild(node.childNodes, n => blocknames.includes(n.nodeName))) {
					// A bold wrapper around block level elements makes no sense
					return content
				}
				return options.strongDelimiter + content + options.strongDelimiter
			}
		})

		turndown.addRule('span', {
			filter: 'span',

			replacement: function (content: string, node: HTMLElement, options) {
				let prefix = ''
				let suffix = ''

				const weightString = node.style.fontWeight
				if (weightString) {
					const weight = parseInt(weightString)
					// Don't mark bold in headers, redundant
					if (weight > 400 && !headernames.includes(node.parentElement?.nodeName)) {
						prefix += options.strongDelimiter
						suffix += options.strongDelimiter
					}	
				}

				if (node.style.fontStyle === 'italic') {
					prefix += options.emDelimiter
					suffix = options.emDelimiter + suffix
				}
				
				return prefix + content + suffix
			}
		})

		turndown.addRule('lineBreak', {
			filter: 'br',

			replacement: function (content, node: Node, options) {
				// no need to process breaks between block nodes
				if (!options.googleDoc &&
					(blocknames.includes(node.previousSibling?.nodeName)
					|| blocknames.includes(node.nextSibling?.nodeName))) {
					return ''
				}
				// This tag is cleaned up later and ensures the line is not collapsed
				return '<br>\n'
			}
		})

		turndown.addRule('table', {
			filter: 'table',
			replacement: function (content: string, node: HTMLElement, options) {
				return '\n\n' + (gridTableFromHTML(node as HTMLTableElement) ?? content.trim()) + '\n\n'
			}
		})

		turndown.addRule('table-row', {
			filter: 'tr',
			replacement: function (content: string, node: HTMLElement, options) {
				return tableRowToMarkdown(node)
			}
		})

		turndown.addRule('table-section', {
			filter: ['thead', 'tbody', 'tfoot'],
			replacement: function (content: string) {
				return content
			}
		})

		turndown.addRule('table-header', {
			filter: 'th',
			replacement: function (content: string, node: HTMLElement, options) {
				return content
			}
		})

		turndown.addRule('table-cell', {
			filter: 'td',
			replacement: function (content: string, node: HTMLElement, options) {
				return content
			}
		})

		/**
		 * The following two rules exist because of how Turndown
		 * processes trailing & leading whitespace for "non block" elements.
		 * Even if content is dropped, trailing & leading whitespace is retained.
		 * 
		 * For these elements, we don't want that.
		 */

		// We want just the conent from these, no whitespace
		const processedNoOpTargets = ['google-sheets-html-origin']
		turndown.addRule('processed-noop', {
			filter: function (node, options) {
				if (processedNoOpTargets.includes(node.nodeName.toLowerCase())) {
					node.flankingWhitespace = { leading: '', trailing: '' }
					return true
				}
				return false
			},
			replacement: function (content) {
				return content
			}
		})

		// We want nothing from these tags, including whitespace
		const processedNullTargets = ['head', 'style', 'col', 'colgroup']
		turndown.addRule('processed-null', {
			filter: function (node, options) {
				if (processedNullTargets.includes(node.nodeName.toLowerCase())) {
					node.flankingWhitespace = { leading: '', trailing: '' }
					return true
				}
				return false
			},
			replacement: function () {
				return ''
			}
		})
	}
	return turndown
}

export default function htmlToMarkdown(html: string): string {
	// TODO: remove hard browser dependency with domino/jsdom/etc
	if (html.startsWith('<!DOCTYPE html')) {
		// When pasting a full document, we only care about the body.
		let frag = document.createElement('html')
		frag.innerHTML = html
		html = frag.getElementsByTagName('body')[0]?.innerHTML ?? html
	}

	const td = getTurndown()
	td.options.googleDoc = html.startsWith('<b id="docs-internal')

	var result: string = td.turndown(html)

	// Clean tokens intentionally retained
	result = cleanPlaceholders(result)

	return result
}
