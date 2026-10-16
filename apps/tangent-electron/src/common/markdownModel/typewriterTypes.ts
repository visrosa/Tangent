import type { FormatType, LineType, TypesetTypes } from 'typewriter-editor/typesetting'
import { h } from 'typewriter-editor/rendering/vdom'
import { foldedLineChildren, foldedText } from './foldedText'
import type { IndentDefinition } from './line'
import { isEqual, type AttributeMap } from '@typewriter/document'
import { isLargeList, type ListDefinition } from './list'
import type { TagSectionData } from './tag'
import type { CodeData } from './code'
import type { MathData } from './math'
import type { FuriganaData } from './furigana'
import type { GlossData } from './gloss'
import type { AssociationListLineData, AssociationListSeparatorData } from './associationList'
import type { TableData } from './table'
import { hiddenGroupEmbedFormat } from './hiddenGroupEmbed'
import { getHiddenGroupAttributes } from './inline'
import { hasCollapsedChildren, isCollapsed } from './sections'
import { getMediaCustomizationsFromText, type LinkAttribute } from './links'

const defaultOptions = {}

function getHideableFormatClass(attributes, baseClass = '') {
	let className = baseClass

	if (attributes.hidden) {
		className += ' hidden'
	}
	if (attributes.start) {
		className += ' start'
	}
	if (attributes.end) {
		className += ' end'
	}
	if (attributes.revealed) {
		className += ' revealed'
	}
	if (attributes.decoration?.focus) {
		// Inject focus classes at the top so that opacity is applied in the right place
		className += ' ' + attributes.decoration?.focus.class
	}

	return className
}

function hideableFormat(
	formatName: string,
	options?: {
		elementName?: string,
		attributeClasses?: string[],
		attributes?: any
	}): FormatType
{
	options = options || defaultOptions
	const elementName = options.elementName || 'span'

	return {
		name: formatName,
		selector: `${elementName}.${formatName}`,
		render: (attributes, children) => {

			let className = getHideableFormatClass(attributes, formatName)

			let formatAttribute = attributes[formatName]
			if (typeof formatAttribute === 'string') {
				className += ' ' + formatAttribute
			}

			if (options.attributeClasses) {
				for (const attr of options.attributeClasses) {
					if (attributes[attr]) {
						className += ' ' + attr
					}
				}
			}

			let elementAttributes: AttributeMap = {
				class: className,
				...options?.attributes
			}

			if (attributes.spellcheck != undefined) {
				elementAttributes.spellcheck = attributes.spellcheck
			}

			return h(elementName, elementAttributes, children)
		}
	}
}

function revealableLine(lineName: string, elementName: string = 'div'): LineType {
	return {
		name: lineName,
		selector: `${elementName}.${lineName}`,
		defaultFollows: true,
		render: (attributes, children) => {
			return h(
				elementName,
				getCoreLineProperties(attributes, lineName),
				foldedLineChildren(attributes, children))
		},
		fromDom: defaultLineFromDom(lineName)
	}
}

function getCoreLineProperties(attributes, baseClass = ''): AttributeMap {

	const props: AttributeMap = {
		className: baseClass + ' line',
		dir: 'auto' // for RTL language support
	}

	const collapsed = attributes.collapsed
	if (typeof collapsed === 'number') {
		// Store the raw value so it can be recovered from the HTML if necessary
		props['data-collapsed'] = collapsed
		if (isCollapsed(collapsed)) {
			props.className += ' collapsed'
		}
		if (hasCollapsedChildren(collapsed)) {
			props.className += ' collapse-parent'
		}
	}

	if (attributes.collapsedReveal) {
		props.className += ' collapsed-revealed'
	}

	if (attributes.hidden) {
		props.className += ' hidden'
	}
	if (attributes.revealed) {
		props.className += ' revealed'
	}
	if (attributes.empty) {
		props.className += ' empty'
	}
	if (attributes.embedLine) {
		props.className += ' embedLine'
	}

	const indent = attributes.indent as IndentDefinition
	if (indent) {
		props.style = getLineIndentStyle(indent.indentSize)
	}

	const decoration = attributes.decoration
	if (decoration) {
		for (const dec of Object.values(decoration)) {
			for (const key of Object.keys(dec)) {
				if (key === 'class') {
					// Since this touches the class, need to reimplement decoration classes
					props.className += ' ' + dec[key]
				}
				else {
					props[key] = dec[key]
				}
			}
		}
	}

	return props
}

function extractCoreLineProperties(element: HTMLElement, attributes: AttributeMap) {
	const collapsed = element.getAttribute('data-collapsed')
	if (collapsed) {
		attributes.collapsed = parseInt(collapsed)
	}
}

function defaultLineFromDom(name: string){
	return (element: HTMLElement) => {
		const attributes: AttributeMap = { [name]: true }
		extractCoreLineProperties(element, attributes)
		return attributes
	}
}

function getLineIndentStyle(indent: number) {
	return '--lineIndent: ' + indent + ';'
}

function codeFormatAltClass(type: string) {
	switch (type) {
		case 'key':
			return 'keyword'
	}
}

function fillTooltip(source: string|object, props: AttributeMap) {
	if (typeof source === 'string') {
		props['data-tooltip'] = source
	}
	else {
		if ('message' in source) {
			props['data-tooltip'] = source.message
		}
		if ('type' in source) {
			props['data-tooltip-type'] = source.type
		}
	}
}

function isAssociationListSeparatorNode(child): boolean {
	if (typeof child !== 'object' || !child) return false
	const className = child.props?.className ?? child.props?.class
	return typeof className === 'string'
		&& className.split(/\s+/).includes('inline-association_separator-container')
}

function splitAssociationListChildren(children: any[]) {
	const separatorIndex = children.findIndex(isAssociationListSeparatorNode)
	if (separatorIndex < 0) return { term: children, separator: undefined, value: [] }

	return {
		term: children.slice(0, separatorIndex),
		separator: children[separatorIndex],
		value: children.slice(separatorIndex + 1)
	}
}

function withoutAssociationListSourceFormatting(children: any[]) {
	const visible = children.filter(child => {
		if (typeof child !== 'object' || !child) return true
		const className = child.props?.className ?? child.props?.class
		return typeof className !== 'string'
			|| !className.split(/\s+/).includes('line_format')
	})

	const firstText = visible.findIndex(child => typeof child === 'string')
	if (firstText >= 0) visible[firstText] = visible[firstText].trimStart()
	return visible
}

// Typewriter substitutes NBSPs before typesetting. Restore only substituted
// ordinary spaces so CSS can collapse them without changing authored NBSPs.
function restoreAssociationListSpaces(children: any[], source: string) {
	let offset = 0
	const visit = child => {
		if (typeof child === 'string') {
			const text = Array.from({ length: child.length }, (_, index) =>
				child[index] === '\u00a0' && source[offset + index] === ' ' ? ' ' : child[index]).join('')
			offset += child.length
			return text
		}
		if (!child?.children) return child
		return { ...child, children: child.children.map(visit) }
	}
	return children.map(visit)
}

function associationListSummaryText(children: any[]): string {
	return children.map(child => {
		if (typeof child === 'string') return child
		const classes = (child?.props?.className ?? child?.props?.class ?? '').split(/\s+/)
		if (classes.includes('hidden') || classes.includes('line_format')) return ''
		if (child?.props?.base) return child.props.base
		if (child?.props?.['math-source']) return child.props['math-source']
		return child?.children ? associationListSummaryText(child.children) : ''
	}).join('').replace(/[ \t\u00a0]+/g, ' ').trim()
}

function collapsedAssociationListSummary(lineData: AssociationListLineEntry[], index: number, hidden: boolean[]) {
	const nextVisible = lineData.findIndex((_entry, next) => next > index && !hidden[next])
	return lineData.slice(index + 1, nextVisible < 0 ? undefined : nextVisible)
		.map(([_attributes, content]) => associationListSummaryText(content)).filter(Boolean).join(' · ')
}

function appendStyle(props: AttributeMap, declaration: string) {
	const style = props.style as string ?? ''
	props.style = `${style}${style && !style.endsWith(';') ? ';' : ''}${declaration}`
}

type AssociationListLineEntry = [AttributeMap, any[], string]

/**
 * Each term depth gets a term/separator column pair, and a term's values
 * start at the next pair, so a nested group begins in its parent's value
 * column.
 */
function getAssociationListColumns(lineData: AssociationListLineEntry[]) {
	const termDepths = new Map<string, number>()
	let maxDepth = 0
	const lines = lineData.map(([attributes]) => {
		const associationList = attributes.associationList as AssociationListLineData
		const parentDepth = associationList.termIndent === undefined ? -1 : termDepths.get(associationList.termIndent) ?? -1
		if (associationList.role === 'value') return { start: 2 * parentDepth + 3, depth: undefined }

		const depth = parentDepth + 1
		termDepths.set(attributes.indent?.indent ?? '', depth)
		maxDepth = Math.max(maxDepth, depth)
		return { start: 2 * depth + 1, depth }
	})
	return { lines, maxDepth }
}
type AssociationListTreeNode = { entry: AssociationListLineEntry, children: AssociationListTreeNode[] }

function buildAssociationListTree(lineData: AssociationListLineEntry[]): AssociationListTreeNode[] {
	const roots: AssociationListTreeNode[] = []
	const latestTermByIndent = new Map<string, AssociationListTreeNode>()

	for (const entry of lineData) {
		const [attributes] = entry
		const associationList = attributes.associationList as AssociationListLineData
		const node: AssociationListTreeNode = { entry, children: [] }
		const parent = associationList.termIndent === undefined
			? undefined
			: latestTermByIndent.get(associationList.termIndent)

		;(parent?.children ?? roots).push(node)
		if (associationList.role === 'term') latestTermByIndent.set(attributes.indent?.indent ?? '', node)
	}

	return roots
}

function getAssociationListLayouts(lineData: AssociationListLineEntry[], hidden: boolean[]) {
	const indices = new Map(lineData.map((entry, index) => [entry[2], index]))
	const layouts: Array<{ row: number, span: number, termRow?: number, valueSpan?: number } | undefined> = []
	const valuesCollapsed: boolean[] = []
	const groupedTerms = new Set<string>()
	const owners = new Map<string, AssociationListTreeNode>()
	const visible = (node: AssociationListTreeNode) => !hidden[indices.get(node.entry[2])]

	const place = (nodes: AssociationListTreeNode[], firstRow: number): number => {
		let nextRow = firstRow
		for (let index = 0; index < nodes.length; index++) {
			let owner = nodes[index]
			let associationList = owner.entry[0].associationList as AssociationListLineData
			if (associationList.role === 'value') {
				if (visible(owner)) layouts[indices.get(owner.entry[2])] = { row: nextRow++, span: 1 }
				continue
			}

			const group = [owner]
			while (!associationList.hasValue && owner.children.length === 0 && index + 1 < nodes.length) {
				const next = nodes[index + 1]
				if ((next.entry[0].associationList as AssociationListLineData).role !== 'term'
					|| next.entry[0].indent?.indent !== owner.entry[0].indent?.indent) break
				groupedTerms.add(owner.entry[2])
				group.push(next)
				owner = next
				associationList = owner.entry[0].associationList as AssociationListLineData
				index++
			}

			for (const child of owner.children) {
				if ((child.entry[0].associationList as AssociationListLineData).role === 'value') owners.set(child.entry[2], owner)
			}
			owners.set(owner.entry[2], owner)
			const terms = group.filter(visible)
			const childRow = nextRow + (associationList.hasValue ? 1 : 0)
			const childEnd = place(owner.children, childRow)
			const endRow = Math.max(nextRow + terms.length, childEnd)
			terms.forEach((term, offset) => {
				const row = nextRow + offset
				layouts[indices.get(term.entry[2])] = {
					row: term === owner && associationList.hasValue ? nextRow : row,
					span: term === owner ? endRow - (associationList.hasValue ? nextRow : row) : 1,
					termRow: term === owner && associationList.hasValue ? offset + 1 : undefined,
					valueSpan: term === owner && associationList.hasValue && childEnd === childRow ? terms.length : 1
				}
			})

			valuesCollapsed[indices.get(owner.entry[2])] = visible(owner)
				&& hasCollapsedChildren(owner.entry[0].collapsed)
				&& (!!associationList.hasValue || childEnd === childRow)

			// A shared value's bar must cover every term, even when there
			// are fewer values than terms.
			const lastChild = owner.children.findLast(visible)
			if (!associationList.hasValue && childEnd < endRow && (lastChild?.entry[0].associationList as AssociationListLineData)?.role === 'value') {
				layouts[indices.get(lastChild.entry[2])].span += endRow - childEnd
			}
			nextRow = endRow
		}
		return nextRow
	}
	place(buildAssociationListTree(lineData), 1)
	return { layouts, valuesCollapsed, groupedTerms, owners }
}

function getAssociationListExportProps(attributes: AttributeMap, role: AssociationListLineData['role'], key: string) {
	const associationList = attributes.associationList as AssociationListLineData
	const props = getCoreLineProperties(attributes, `association-list-${role}`)
	props.key = key
	props['data-association-list-role'] = role
	if (associationList.hasValue !== undefined) props['data-association-list-has-value'] = String(associationList.hasValue)
	if (associationList.termIndent !== undefined) props['data-association-list-term-indent'] = associationList.termIndent
	if (associationList.rootIndent !== undefined) props['data-association-list-root-indent'] = associationList.rootIndent
	return props
}

/**
 * HTML reads consecutive `<dt>`s as terms sharing the `<dd>`s that follow,
 * so nested terms are wrapped in a `<dd>` of their parent instead of being
 * emitted beside it.
 */
function renderAssociationListExportItems(nodes: AssociationListTreeNode[]) {
	const items = []

	for (const node of nodes) {
		const [attributes, children, id] = node.entry
		const associationList = attributes.associationList as AssociationListLineData

		if (associationList.role === 'value') {
			items.push(h('dd', getAssociationListExportProps(attributes, 'value', id), withoutAssociationListSourceFormatting(children)))
		}
		else if (associationList.hasValue) {
			const split = splitAssociationListChildren(children)
			items.push(h('dt', getAssociationListExportProps(attributes, 'term', `${id}-term`), withoutAssociationListSourceFormatting(split.term)))
			items.push(h('dd', getAssociationListExportProps(attributes, 'value', `${id}-value`), split.value))
		}
		else {
			const split = splitAssociationListChildren(children)
			items.push(h('dt', getAssociationListExportProps(attributes, 'term', id), withoutAssociationListSourceFormatting(split.term)))
		}

		let subtree: AssociationListTreeNode[] = []
		const flushSubtree = () => {
			if (!subtree.length) return
			items.push(h('dd', { className: 'association-list-subtree', key: `${subtree[0].entry[2]}-subtree` }, [
				h('dl', { className: 'association-list' }, renderAssociationListExportItems(subtree))
			]))
			subtree = []
		}

		for (const child of node.children) {
			if ((child.entry[0].associationList as AssociationListLineData).role === 'term') {
				subtree.push(child)
			}
			else {
				flushSubtree()
				items.push(...renderAssociationListExportItems([child]))
			}
		}
		flushSubtree()
	}

	return items
}

const noteTypeset:TypesetTypes = {
	lines: [
		{
			name: 'line',
			selector: 'p',
			render: (attributes, children) => {
				return h('p', getCoreLineProperties(attributes), foldedLineChildren(attributes, children))
			},
			fromDom: defaultLineFromDom('line')
		},
		{
			name: 'header',
			selector: 'h1, h2, h3, h4, h5, h6',
			defaultFollows: true,
			render: (attributes, children) => h(`h${attributes.header}`, getCoreLineProperties(attributes), foldedLineChildren(attributes, children)),
			fromDom: defaultLineFromDom('header') // Technically incorrect, but will be re-parsed anyhow
		},
		{
			name: 'associationList',
			selector: 'dl.association-list > dt, dl.association-list > dd:not(.association-list-subtree), div.editor-association-list > div.association-list-line',
			defaultFollows: true,
			fromDom(node: HTMLElement) {
				const role = node.getAttribute('data-association-list-role') === 'value' ? 'value' : 'term'
				const associationList: AssociationListLineData = {
					role,
					glyph: undefined
				}

				const hasValue = node.getAttribute('data-association-list-has-value')
				if (hasValue !== null) associationList.hasValue = hasValue === 'true'

				const termIndent = node.getAttribute('data-association-list-term-indent')
				if (termIndent !== null) associationList.termIndent = termIndent

				const rootIndent = node.getAttribute('data-association-list-root-indent')
				if (rootIndent !== null) associationList.rootIndent = rootIndent

				const attributes: AttributeMap = { associationList }
				extractCoreLineProperties(node, attributes)
				return attributes
			},
			shouldCombine: (first, next) => {
				const firstAssociationList = first.associationList as AssociationListLineData
				const nextAssociationList = next.associationList as AssociationListLineData
				if (!firstAssociationList || !nextAssociationList) return false

				const firstRootIndent = firstAssociationList.rootIndent
					?? firstAssociationList.termIndent
					?? first.indent?.indent
					?? ''
				const nextRootIndent = nextAssociationList.rootIndent
					?? nextAssociationList.termIndent
					?? next.indent?.indent
					?? ''
				return firstRootIndent === nextRootIndent
					&& first.blockquote === next.blockquote
			},
			renderMultiple: (lineData, editor, forHTML) => {
				let revealed = false
				const wrap = content => {
					const depth = lineData[0][0].blockquote
					if (!depth) return content

					return h('blockquote', {
						className: `depth-${depth}${revealed ? ' revealed' : ''}`
					}, content)
				}

				if (!forHTML) {
					const hidden = lineData.map(([attributes]) => isCollapsed(attributes.collapsed)
						&& !attributes.collapsedReveal)
					const columns = getAssociationListColumns(lineData)
					const { layouts, valuesCollapsed, groupedTerms, owners } = getAssociationListLayouts(lineData, hidden)

					const lines = lineData.map(([attributes, children, id], index) => {
						const sourceLine = editor.doc.getLineBy(id)
						if (sourceLine) {
							const source = sourceLine.content.ops.map(op => typeof op.insert === 'string' ? op.insert : '\ufffc').join('')
							children = restoreAssociationListSpaces(children, source)
						}
						const associationList = attributes.associationList as AssociationListLineData
						if (attributes.revealed) revealed = true

						let className = `association-list-line association-list-${associationList.role}`
						if (associationList.termIndent !== undefined) className += ' association-list-nested'
						if (groupedTerms.has(id)) className += ' association-list-group-term'
						if (valuesCollapsed[index]) className += ' association-list-values-collapsed'

						const owner = owners.get(id)
						const bar = () => h('span', {
							className: 'association-list-collapse-bar',
							contenteditable: 'false',
							role: 'button',
							tabindex: '0',
							'aria-label': hasCollapsedChildren(owner.entry[0].collapsed) ? 'Expand values' : 'Collapse values',
							'aria-expanded': String(!hasCollapsedChildren(owner.entry[0].collapsed)),
							'data-association-list-owner': owner.entry[2]
						}, [])
						let lineChildren = children
						if (associationList.role === 'term') {
							const split = splitAssociationListChildren(children)
							if (split.separator) {
								const separator = h('span', { className: 'association-list-separator' }, [split.separator])

								if (associationList.hasValue) {
									className += ' association-list-inline'
									if (layouts[index]?.termRow > 1) className += ' association-list-shared-inline'
									lineChildren = [
										h('span', { className: 'association-list-term-content' }, split.term),
										separator,
										h('span', { className: 'association-list-value-content' }, [bar(), ...(valuesCollapsed[index] ? [foldedText(split.value)] : split.value)])
									]
								}
								else {
									const summary = collapsedAssociationListSummary(lineData, index, hidden)
									lineChildren = [
										h('span', { className: 'association-list-term-content' }, split.term),
										separator,
										...(valuesCollapsed[index] ? [h('span', {
											className: 'association-list-summary',
											'data-summary': summary
										}, [bar(), foldedText([h('span', {
											className: 'association-list-summary-text', 'data-summary': summary
										}, [])])])] : [])
									]
								}
							}
						}

						if (associationList.role === 'value' && owner) lineChildren = [bar(), ...foldedLineChildren(attributes, lineChildren)]

						const props = getCoreLineProperties(attributes, className)
						const layout = layouts[index]
						if (layout?.termRow) appendStyle(props, `--associationListTermRow:${layout.termRow};--associationValueSpan:${layout.valueSpan};`)
						if (layout) {
							appendStyle(props, layout.span > 1
								? `grid-row:${layout.row} / span ${layout.span};`
								: `grid-row:${layout.row};`)
						}
						const { start, depth } = columns.lines[index]
						const end = associationList.role === 'value' || associationList.hasValue || valuesCollapsed[index] ? -1 : start + 2
						appendStyle(props, `grid-column:${start} / ${end};`)
						if (depth !== undefined) props['data-association-list-depth'] = String(depth)
						props.key = id
						props['data-association-list-role'] = associationList.role
						if (associationList.hasValue !== undefined) props['data-association-list-has-value'] = String(associationList.hasValue)
						if (associationList.termIndent !== undefined) props['data-association-list-term-indent'] = associationList.termIndent
						if (associationList.rootIndent !== undefined) props['data-association-list-root-indent'] = associationList.rootIndent
						return h('div', props, lineChildren)
					})

					// associationListAlignment sets the widths to align blocks separated by blank lines
					const termTracks = Array.from({ length: columns.maxDepth + 1 },
						(_track, depth) => `minmax(var(--associationListTermWidth${depth}, 0px), max-content) max-content`)
					const rootIndent = lineData[0][0].indent?.indentSize ?? 0
					return wrap(h('div', {
						className: revealed
							? 'association-list editor-association-list revealed'
							: 'association-list editor-association-list',
						'data-association-list-block': lineData[0][2],
						style: `grid-template-columns:${termTracks.join(' ')} minmax(0, 1fr);`
							+ `margin-inline-start:calc(var(--spaceWidth) * ${rootIndent});`
					}, lines))
				}

				if (lineData.some(([attributes]) => attributes.revealed)) revealed = true
				const items = renderAssociationListExportItems(buildAssociationListTree(lineData))

				return wrap(h('dl', {
					className: revealed ? 'association-list revealed' : 'association-list'
				}, items))
			}
		},
		{
			name: 'list',
			selector: 'p.list',
			defaultFollows: true,
			render: (attributes, children) => {
				const listData = attributes.list as ListDefinition
				let props = getCoreLineProperties(attributes, 'list') as any
				props.listForm = listData.form
				props.listGlyph = listData.glyph

				if (isLargeList(listData)) {
					props.className += ' largeList'
				}

				if (listData.todoState) {
					props.className += ' checkbox ' + listData.todoState
				}

				return h('p', props, foldedLineChildren(attributes, children))
			},
			fromDom: defaultLineFromDom('list')
		},
		{
			name: 'blockquote',
			selector: 'blockquote p',
			defaultFollows: false,
			fromDom(node: HTMLElement) {
				const { className } = node.parentElement
				const match = className.match(/depth-(\d+)/)
				const blockquote = parseInt(match && match[1])
				const attributes: AttributeMap = { blockquote }
				extractCoreLineProperties(node, attributes)
				return attributes
			},
			shouldCombine: (prev, next) => {
				return prev.blockquote === next.blockquote
					&& isEqual(prev.indent, next.indent)
			},
			renderMultiple: lineData => {
				let depth = lineData[0][0].blockquote
				let revealed = false
				let indent = -1

				const children = lineData.map(([attributes, children, id]) => {
					if (indent === -1) indent = attributes.indent.indentSize
					if (attributes.revealed) revealed = true

					let props = getCoreLineProperties(attributes, 'blockquote')
					props.style = `--innerLineIndent: ${indent};` // Replace indent
					props.key = id

					return h('p', props, foldedLineChildren(attributes, children))
				})

				let className = 'depth-' + depth
				if (revealed) {
					className += ' revealed'
				}

				let style = ''
				if (indent) {
					style += getLineIndentStyle(indent)
				}

				return h('blockquote', { className, style }, children)
			}
		},
		{
			name: 'table',
			selector: 'figure.table-block-container div.tableLine',
			defaultFollows: true,
			fromDom(node: HTMLElement) {
				const figure = node.closest('figure.table-block-container')
				const source = Array.from(figure.querySelectorAll('div.tableLine')).map(line => line.textContent).join('\n')
				const model = JSON.parse(figure.querySelector('t-table-preview')?.getAttribute('model') ?? 'null')
				const filepath = figure.querySelector('t-table-preview')?.getAttribute('filepath') ?? undefined
				const attributes: AttributeMap = {
					table: { id: Number(node.dataset.tableId), source, model, filepath },
					hidden: true
				}
				extractCoreLineProperties(node, attributes)
				return attributes
			},
			shouldCombine: (prev, next) => prev.table.id === next.table.id,
			renderMultiple: (lineData, editor, forHTML) => {
				const table = lineData[0][0].table as TableData
				if (forHTML) return h('pre', { className: 'table-source' }, h('code', null, table.source))
				const revealed = lineData.some(([attributes]) => attributes.revealed)
				const collapsed = lineData.some(([attributes]) => isCollapsed(attributes.collapsed) || hasCollapsedChildren(attributes.collapsed))
				const physicalLines = table.source.split('\n')
				const sourceLines = lineData.map(([attributes, children, id], index) => {
					const props = getCoreLineProperties(attributes, 'tableLine')
					props.key = id
					props['data-table-id'] = table.id
					// Preformatted source needs no inline renderer's space-to-NBSP substitution.
					return h('div', props, foldedLineChildren(attributes, [physicalLines[index] || h('br')]))
				})
				return h('figure', {
					className: 'table-block-container output-container' + (revealed ? ' revealed' : '')
				}, [
					h('pre', {
						className: 'table-source hidden' + (revealed ? ' revealed' : ''),
						spellcheck: false
					}, h('code', null, sourceLines)),
					h('t-table-preview', {
						className: 'output',
						model: JSON.stringify(table.model),
						filepath: table.filepath,
						'data-table-id': table.id,
						contentEditable: 'false',
						style: collapsed && !revealed ? 'display: none;' : ''
					})
				])
			}
		},
		{
			name: 'code',
			selector: 'pre code div.codeLine',
			defaultFollows: true,
			fromDom(node: HTMLElement) {
				const { className } = node.parentElement
				const match = className.match(/language-(.*)/)
				const result: AttributeMap = {}
				if (match && match[1] !== 'none') {
					result.code = {
						language: match[1]
					}
				}
				extractCoreLineProperties(node, result)
				return result
			},
			shouldCombine: (prev, next) => {
				return isEqual(prev.code, next.code)
					&& prev.indent.indent === next.indent.indent
			},
			renderMultiple: lineData => {
				let isRevealed = false
				let indent = -1
				let isSectionCollapsed = false
				const children = lineData.map(([attributes, children, id]) => {
					if (attributes.revealed) isRevealed = true
					if (indent === -1) indent = attributes.indent.indentSize
					if (!isSectionCollapsed && isCollapsed(attributes.collapsed)) isSectionCollapsed = true

					let props = getCoreLineProperties(attributes, 'codeLine')
					props.key = id

					return h('div', props, foldedLineChildren(attributes, children))
				})

				const codeData = lineData[0][0].code as CodeData
				const codeLanguage = codeData.language
				const codeClass = codeLanguage ? `language-${codeLanguage}` : 'language-none'

				let preClass = codeClass
				let preStyle = ''
				if (indent) {
					preStyle += getLineIndentStyle(indent)
					preClass += ' indented'
				}
				if (isRevealed) {
					preClass += ' revealed'
				}

				const content = h(
					'pre',
					{
						className: preClass,
						spellcheck: false,
						style: preStyle
					},
					h(
						'code',
						{
							className: codeClass
						},
						children
					)
				)

				if (codeData.source) {
					let figureClass = 'output-container'
					let figureStyle = ''
					if (isSectionCollapsed && !isRevealed) {
						figureStyle += 'display: none;'
					}
					if (isRevealed) {
						figureClass += ' revealed'
					}
					return h('figure',
						{
							className: figureClass,
							style: figureStyle
						},
						[
							content,
							h('t-code-preview', {
								className: 'output',
								language: codeData.language,
								source: codeData.source
							})
						]
					)
				}
				return content
			}
		},
		{
			name: 'front_matter',
			selector: 'div.frontMatter code div.frontMatterLine',
			defaultFollows: true,
			fromDom: defaultLineFromDom('front_matter'),
			shouldCombine: (prev, next) => {
				return prev.front_matter === next.front_matter
			},
			renderMultiple: lineData => {
				const children = lineData.map(([attributes, children, id], index) => {
					let props = getCoreLineProperties(attributes, 'frontMatterLine')
					props.key = id
					if (index === 0) {
						props.className += ' start'
					}
					else if (attributes.end) {
						props.className += ' end'
					}
					return h('div', props, foldedLineChildren(attributes, children))
				})
				return h('div', { className: 'frontMatter', spellcheck: false }, h('code', null, children))
			}
		},
		{
			name: 'math',
			selector: 'figure pre code div.mathLine',
			defaultFollows: true,
			fromDom: defaultLineFromDom('math'),
			shouldCombine: (prev, next) => {
				return prev.math.source === next.math.source
					&& prev.indent.indent === next.indent.indent
			},
			renderMultiple: lineData => {
				let math: MathData = null
				let indent = -1
				let revealed = false
				let isSectionCollapsed = false
				const codeChildren = lineData.map(([attributes, children, id]) => {
					if (!math) math = attributes.math
					if (indent === -1) indent = attributes.indent.indentSize
					if (attributes.revealed) revealed = true
					if (!isSectionCollapsed && isCollapsed(attributes.collapsed)) isSectionCollapsed = true

					let props = getCoreLineProperties(attributes, 'mathLine')
					props.key = id

					return h('div', props, foldedLineChildren(attributes, children))
				})

				let containerClass = 'math-block-container output-container'

				const codeClass = 'language-latext'
				let preClass = codeClass + ' hidden'

				let mathClass = 'output'
				let mathStyle = ''

				if (indent) {
					mathStyle += getLineIndentStyle(indent)
					mathClass += ' indented'
				}
				if (revealed) {
					containerClass += ' revealed'
					preClass += ' revealed'
					mathClass += ' revealed'
				}

				if (isSectionCollapsed && !revealed) {
					mathStyle += 'display: none;'
				}

				return h('figure', {
					className: containerClass
				}, [
					h('pre',
						{
							className: preClass,
							spellcheck: false
						},
						h(
							'code',
							{
								className: codeClass
							},
							codeChildren
						)
					),
					h('t-math',
						{
							'math-source': math.source,
							'block': '',
							className: mathClass,
							style: mathStyle
						}
					)
				])
			}
		},
		revealableLine('horizontal_rule', 'p')
	],
	formats: [
		// Formatting that starts a line
		{
			name: 'line_format',
			selector: 'span.line_format',
			render: (attributes, children) => {
				let props = {
					className: getHideableFormatClass(attributes, 'line_format ' + attributes.line_format)
				} as any

				// This needs to work with all line prefixing

				if (attributes.list_format) {
					const listData = attributes.list_format as ListDefinition
					props.listGlyph = listData.glyph
					if (listData.todoState != null) {
						props.className += ' checkbox'
					}
				}

				return h('span', props, children)
			}
		},

		{
			name: 'line_comment',
			selector: 'span.line_comment',
			render: (attributes, children) => {
				let className = 'comment line_comment'
				if (attributes.line_comment === 'start') {
					className += ' start hidden'
					if (attributes.revealed) {
						className += ' revealed'
					}
				}
				return h('span', { className }, children)
			}
		},

		hiddenGroupEmbedFormat<AssociationListSeparatorData>({
			name: 'association_separator',
			renderOutput: () => h('span', {
				className: 'association-list-separator-output',
				'aria-hidden': 'true'
			})
		}),

		{
			name: 'list_format',
			selector: 'span.list_format',
			render: (attributes, children: any) => {
				let className = 'list_format'

				const listData = attributes.list_format as ListDefinition

				if (attributes.revealed) {
					className += ' revealed'
				}

				if (listData.todoState != undefined) {
					className += ' checkbox'
					if (!attributes.revealed) {
						children = [
							h('span', { className: 'text' }, children),
							h('t-checkbox', {
								state: listData.todoState
							})
						]
					}
				}
				else {
					children = h('span', { className: 'text' }, children)
				}

				return h('span', {
					className,
					listGlyph: listData.glyph
				}, children)
			}
		},

		{
			name: 't_embed',
			selector: '.t-embed',
			render: (attributes, children) => {
				let className = 't-embed output-container'
				if (attributes.revealed) {
					className += ' revealed'
				}

				let link = attributes.t_link as LinkAttribute

				let embedClassname = 'output'
				const customizations = getMediaCustomizationsFromText(link.text)
				if (customizations) {
					if (customizations.float === 'left') {
						className += ' float-left'
						embedClassname += ' float-left'
					}
					else if (customizations.float === 'right') {
						className += ' float-right'
						embedClassname += ' float-right'
					}
				}

				let node = h(
					'span',
					{
						class: className,
						...getHiddenGroupAttributes(attributes)
					},
					children
				) as any

				// forward the link information
				node.t_embed_props = {
					...attributes.t_link,
					className: embedClassname
				}

				return node
			},
			postProcess: (node) => {
				node.children.push(h(
					't-embed',
					(node as any).t_embed_props
				))
				return node;
			}
		},

		{
			name: 't_link',
			selector: 't-link',
			render: (attributes, children) => {
				let className = ''
				if (attributes.revealed) {
					className += ' revealed'
				}
				return h(
					't-link',
					{
						...attributes.t_link,
						className: className,
						...getHiddenGroupAttributes(attributes)
					},
					children)
			}
		},

		{
			name: 'highlight',
			selector: 'mark',
			render: (attributes, children) => {
				let className = getHideableFormatClass(attributes)
				if (typeof attributes.highlight === 'string') {
					className += ' ' + attributes.highlight
				}
				return h('mark', { className }, children)
			}
		},

		hideableFormat('inline_code',
			{
				elementName: 'code',
				attributeClasses: ['afterSpace', 'beforeSpace'],
				attributes: {
					spellcheck: false
				}
			}),

		hideableFormat('italic', { elementName: 'em' } ),
		hideableFormat('bold', { elementName: 'strong' }),
		hideableFormat('strikethrough', { elementName: 's' }),

		{
			name: 'error',
			selector: 'span.error',
			render: (attributes, children) => {

				const className = 'error'
				const props: AttributeMap = { className }

				fillTooltip(attributes.error, props)

				return h('span', props, children)
			}
		},

		{
			name: 'warning',
			selector: 'span.warning',
			render: (attributes, children) => {

				const className = 'warning'
				const props: AttributeMap = { className }
				fillTooltip(attributes.warning, props)

				return h('span', props, children)
			}
		},

		{
			name: 'code_syntax',
			selector: 'span.code_syntax',
			render: (attributes, children) => {
				let className = 'code_syntax token'
				if (typeof attributes.code_syntax === 'string') {
					className += ' '
					className += attributes.code_syntax

					const alts = codeFormatAltClass(attributes.code_syntax)
					if (alts) {
						className += ' '
						className += alts
					}
				}

				return h('span', { className }, children)
			}
		},

		{
			name: 'tag',
			selector: 'span.tag',
			render: (attributes, children) => {
				const tag = attributes.tag as string[]
				let className = 'tag TAG-' + tag.join('--')
				if (attributes.revealed) {
					className += ' revealed'
				}
				const props = {
					className,
					spellcheck: false
				}
				return h('span', props, children)
			}
		},
		{
			name: 'tag_section',
			selector: 'span.tag_section',
			render: (attributes, children) => {
				const section = attributes.tag_section as TagSectionData
				let className = 'tagSection TAG-' + section.name + ' tagSectionDepth-' + section.depth
				if (section.depth === section.totalDepth) {
					className += ' last'
				}
				if (attributes.revealed) {
					className += ' revealed'
				}
				const props = {
					className
				}
				return h('span', props, children)
			}
		},
		{
			name: 'tag_seperator',
			selector: 'span.tagSeperator',
			render: (attributes, children) => {
				const seperator = attributes.tag_seperator
				let className = 'tagSeperator' + ' tagSeperatorDepth-' + seperator.depth
				className += ' tagSeperator--' + seperator.prev + '--' + seperator.next
				if (attributes.revealed) {
					className += ' revealed'
				}
				const props = {
					className
				}
				return h('span', props, children)
			}
		},

		hiddenGroupEmbedFormat<MathData>({
			name: 'math',
			renderOutput: (math, attributes) => {
				let tMathAttr = {
					'math-source': math.source
				} as any

				if (attributes.revealed) {
					tMathAttr.className = 'revealed'
				}

				if (math.isBlock) {
					tMathAttr.block = ''
				}

				if (attributes.decoration?.focus) {
					// Inject the focus decoration onto the shadow root.
					tMathAttr.className = [tMathAttr.className, attributes.decoration.focus.class].filter(Boolean).join(' ')
				}

				return h('t-math', tMathAttr, [])
			}
		}),

		hiddenGroupEmbedFormat<GlossData>({
			name: 'gloss',
			renderOutput: (gloss, attributes) => {
				const tGlossAttr = { base: gloss.base, description: gloss.description } as any

				if (attributes.decoration?.focus) {
					// Inject the focus decoration onto the shadow root, as math does.
					tGlossAttr.className = attributes.decoration.focus.class
				}

				return h('t-gloss', tGlossAttr, [])
			}
		}),

		hiddenGroupEmbedFormat<FuriganaData>({
			name: 'furigana',
			renderOutput: (furigana, attributes) => {
				const tFuriganaAttr = { base: furigana.base, reading: furigana.reading } as any

				if (attributes.decoration?.focus) {
					// Inject the focus decoration onto the shadow root, as math does.
					tFuriganaAttr.className = attributes.decoration.focus.class
				}

				return h('t-furigana', tFuriganaAttr, [])
			}
		}),

		{
			name: 'templateToken',
			selector: 'span.templateToken',
			render: (attributes, children) => {
				return h('span', {
					className: 'templateToken',
					'data-tooltip-type': 'templateToken',
				}, children)
			}
		},

		hideableFormat('link_internal'),
		hideableFormat('tag_internal')
	]
}

// Initialize with the attributes not directly attached to types
let formatClearSet = {
	hidden: null,
	hiddenGroup: null,
	revealed: null,
	end: null,
	start: null,
	beforeSpace: null,
	afterSpace: null
}
for (const format of noteTypeset.formats) {
	if (typeof format === 'string') {
		formatClearSet[format] = null
	}
	else {
		formatClearSet[format.name] = null
	}
}

export const negativeInlineFormats = formatClearSet

export default noteTypeset
