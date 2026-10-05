import type { FormatType, LineType, TypesetTypes } from 'typewriter-editor/typesetting'
import { h } from 'typewriter-editor/rendering/vdom'
import type { IndentDefinition } from './line'
import { isEqual, type AttributeMap } from '@typewriter/document'
import { isLargeList, type ListDefinition } from './list'
import type { TagSectionData } from './tag'
import type { CodeData } from './code'
import type { MathData } from './math'
import type { FuriganaData } from './furigana'
import type { GlossData } from './gloss'
import type { DlLineData, DlSeparatorData } from './dl'
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
				children)
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

function isDlSeparatorNode(child): boolean {
	if (typeof child !== 'object' || !child) return false
	const className = child.props?.className ?? child.props?.class
	return typeof className === 'string'
		&& className.split(/\s+/).includes('inline-dl_sep-container')
}

function splitDlChildren(children: any[]) {
	const separators: any[] = []
	const segments: any[][] = [[]]

	for (const child of children) {
		if (isDlSeparatorNode(child)) {
			separators.push(child)
			segments.push([])
		}
		else {
			segments.at(-1).push(child)
		}
	}

	return {
		term: segments[0],
		separators,
		definitions: segments.slice(1)
	}
}

function withoutDlSourceFormatting(children: any[]) {
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

function appendStyle(props: AttributeMap, declaration: string) {
	const style = props.style as string ?? ''
	props.style = `${style}${style && !style.endsWith(';') ? ';' : ''}${declaration}`
}

const collapsedDlDescriptions = new WeakMap<object, Set<string>>()

function getCollapsedDlDescriptions(editor: object): Set<string> {
	let collapsed = collapsedDlDescriptions.get(editor)
	if (!collapsed) {
		collapsed = new Set()
		collapsedDlDescriptions.set(editor, collapsed)
	}
	return collapsed
}

function getDlIndent(attributes: AttributeMap): number {
	return attributes.indent?.indentSize ?? attributes.indent?.indent?.length ?? 0
}

const noteTypeset:TypesetTypes = {
	lines: [
		{
			name: 'line',
			selector: 'p',
			render: (attributes, children) => {
				return h('p', getCoreLineProperties(attributes), children)	
			},
			fromDom: defaultLineFromDom('line')
		},
		{
			name: 'header',
			selector: 'h1, h2, h3, h4, h5, h6',
			defaultFollows: true,
			render: (attributes, children) => h(`h${attributes.header}`, getCoreLineProperties(attributes), children),
			fromDom: defaultLineFromDom('header') // Technically incorrect, but will be re-parsed anyhow
		},
		{
			name: 'dl',
			selector: 'dl.description-list > dt, dl.description-list > dd, div.editor-description-list > div.dl-line',
			defaultFollows: true,
			fromDom(node: HTMLElement) {
				const role = node.getAttribute('data-dl-role') === 'value' ? 'value' : 'term'
				const dl: DlLineData = {
					role,
					glyph: undefined
				}

				const hasDef = node.getAttribute('data-dl-has-def')
				if (hasDef !== null) dl.hasDef = hasDef === 'true'

				const termIndent = node.getAttribute('data-dl-term-indent')
				if (termIndent !== null) dl.termIndent = termIndent

				const rootIndent = node.getAttribute('data-dl-root-indent')
				if (rootIndent !== null) dl.rootIndent = rootIndent

				const attributes: AttributeMap = { dl }
				extractCoreLineProperties(node, attributes)
				return attributes
			},
			shouldCombine: (first, next) => {
				const firstDl = first.dl as DlLineData
				const nextDl = next.dl as DlLineData
				if (!firstDl || !nextDl) return false

				const firstRootIndent = firstDl.rootIndent
					?? firstDl.termIndent
					?? first.indent?.indent
					?? ''
				const nextRootIndent = nextDl.rootIndent
					?? nextDl.termIndent
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
					const collapsed = getCollapsedDlDescriptions(editor)
					const collapsedAncestorIndents: number[] = []
					const states = lineData.map(([attributes, _children, id], index) => {
						const dl = attributes.dl as DlLineData
						const indent = getDlIndent(attributes)
						while (collapsedAncestorIndents.length
							&& collapsedAncestorIndents.at(-1) >= indent) {
							collapsedAncestorIndents.pop()
						}

						const nextAttributes = lineData[index + 1]?.[0]
						const hasNestedDescription = dl.role === 'term'
							&& nextAttributes
							&& getDlIndent(nextAttributes) > indent
						const collapsible = dl.role === 'term'
							&& (dl.hasDef === true || hasNestedDescription)
						const isCollapsed = collapsible && collapsed.has(id)
						const hiddenByAncestor = collapsedAncestorIndents.length > 0

						if (isCollapsed && hasNestedDescription) {
							collapsedAncestorIndents.push(indent)
						}

						return { collapsible, hiddenByAncestor, isCollapsed }
					})
					const layouts: Array<{ row: number, span: number }> = []
					let nextRow = 1
					for (let index = 0; index < lineData.length; index++) {
						if (layouts[index]) continue
						if (states[index].hiddenByAncestor) {
							layouts[index] = { row: nextRow, span: 1 }
							continue
						}

						const [attributes] = lineData[index]
						const dl = attributes.dl as DlLineData
						if (dl.role === 'term' && dl.hasDef === false && !states[index].isCollapsed) {
							const termIndent = attributes.indent?.indent ?? ''
							let valueCount = 0
							for (let valueIndex = index + 1; valueIndex < lineData.length; valueIndex++) {
								const [valueAttributes] = lineData[valueIndex]
								const valueDl = valueAttributes.dl as DlLineData
								if (valueDl.role !== 'value' || valueDl.termIndent !== termIndent) break
								if (states[valueIndex].hiddenByAncestor) continue
								layouts[valueIndex] = { row: nextRow + valueCount, span: 1 }
								valueCount++
							}

							const span = Math.max(1, valueCount)
							layouts[index] = { row: nextRow, span }
							nextRow += span
							continue
						}

						layouts[index] = { row: nextRow, span: 1 }
						nextRow++
					}

					const lines = lineData.map(([attributes, children, id], index) => {
						const dl = attributes.dl as DlLineData
						const state = states[index]
						if (attributes.revealed) revealed = true

						let className = `dl-line dl-${dl.role}`
						if (dl.termIndent !== undefined) className += ' dl-nested'
						if (state.isCollapsed) className += ' dl-description-collapsed'
						if (state.hiddenByAncestor) className += ' dl-collapsed-child'

						let toggle
						if (state.collapsible) {
							const onToggle = event => {
								if (!editor.enabled) return
								event.preventDefault()
								event.stopPropagation()
								if (collapsed.has(id)) collapsed.delete(id)
								else collapsed.add(id)
								editor.render()
							}
							toggle = h('button', {
								className: 'dl-description-toggle',
								contentEditable: false,
								'aria-label': state.isCollapsed ? 'Expand description' : 'Collapse description',
								'aria-expanded': String(!state.isCollapsed),
								onmousedown: onToggle,
								ontouchstart: onToggle
							})
						}

						let lineChildren = children
						if (dl.role === 'term') {
							const split = splitDlChildren(children)
							if (split.separators.length) {
								const controls = h('span', { className: 'dl-separator-controls' }, [
									split.separators[0],
									toggle
								].filter(Boolean))

								if (dl.hasDef) {
									className += ' dl-inline'
									const definitionRows = split.definitions.map((definition, definitionIndex) => {
										const rowChildren = definitionIndex === 0
											? definition
											: [split.separators[definitionIndex], ...definition]
										return h('span', { className: 'dl-definition-row dl-definition-content' }, rowChildren)
									})
									lineChildren = [
										h('span', { className: 'dl-term-content' }, split.term),
										controls,
										h('span', { className: 'dl-definition-stack' }, definitionRows)
									]
								}
								else {
									lineChildren = [
										h('span', { className: 'dl-term-content' }, split.term),
										controls
									]
								}
							}
						}

						const props = getCoreLineProperties(attributes, className)
						const layout = layouts[index]
						appendStyle(props, layout.span > 1
							? `grid-row:${layout.row} / span ${layout.span};`
							: `grid-row:${layout.row};`)
						props.key = id
						props['data-dl-role'] = dl.role
						if (dl.hasDef !== undefined) props['data-dl-has-def'] = String(dl.hasDef)
						if (dl.termIndent !== undefined) props['data-dl-term-indent'] = dl.termIndent
						if (dl.rootIndent !== undefined) props['data-dl-root-indent'] = dl.rootIndent
						return h('div', props, lineChildren)
					})

					return wrap(h('div', {
						className: revealed
							? 'description-list editor-description-list revealed'
							: 'description-list editor-description-list'
					}, lines))
				}

				const items = []

				for (const [attributes, children, id] of lineData) {
					const dl = attributes.dl as DlLineData
					if (attributes.revealed) revealed = true

					const getProps = (role: DlLineData['role'], key: string) => {
						const props = getCoreLineProperties(attributes, `dl-${role}`)
						props.key = key
						props['data-dl-role'] = role
						if (dl.hasDef !== undefined) props['data-dl-has-def'] = String(dl.hasDef)
						if (dl.termIndent !== undefined) props['data-dl-term-indent'] = dl.termIndent
						if (dl.rootIndent !== undefined) props['data-dl-root-indent'] = dl.rootIndent
						return props
					}

					if (dl.role === 'value') {
						items.push(h('dd', getProps('value', id), withoutDlSourceFormatting(children)))
						continue
					}

					if (!dl.hasDef) {
						const split = splitDlChildren(children)
						items.push(h('dt', getProps('term', id), withoutDlSourceFormatting(split.term)))
						continue
					}

					const split = splitDlChildren(children)
					items.push(h('dt', getProps('term', `${id}-term`), withoutDlSourceFormatting(split.term)))
					for (const [definitionIndex, definition] of split.definitions.entries()) {
						items.push(h('dd', getProps('value', `${id}-definition-${definitionIndex}`), definition))
					}
				}

				return wrap(h('dl', {
					className: revealed ? 'description-list revealed' : 'description-list'
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

				return h('p', props, children)
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

					return h('p', props, children)
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

					return h('div', props, children)
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
					return h('div', props, children)
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

					return h('div', props, children)
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

		hiddenGroupEmbedFormat<DlSeparatorData>({
			name: 'dl_sep',
			renderOutput: () => h('span', {
				className: 'dl-separator-output',
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
