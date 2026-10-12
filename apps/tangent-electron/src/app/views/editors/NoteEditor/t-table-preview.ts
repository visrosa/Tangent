import { markAsSelectionRequest } from 'app/events'
import { defineCustomElement } from 'app/utils/defineCustomElement'
import type { TableModel, TableRow } from 'common/markdownModel/tableModel'
import { TangentLink } from './t-link'
import { markdownPreviewStyleSheet, renderMarkdown } from './renderMarkdown'

const tableStyleSheet = new CSSStyleSheet()
tableStyleSheet.replaceSync(`
	:host { display: block; max-width: 100%; overflow-x: auto; white-space: normal; }
	table { border-collapse: collapse; width: max-content; max-width: 100%; }
	th, td { border: 1px solid var(--deemphasizedTextColor); padding: .35em .65em; vertical-align: top; }
	th { font-weight: bold; }
	caption { text-align: start; padding-bottom: .5em; }
	article.note { line-height: inherit; }
`)

class TangentTablePreview extends HTMLElement {
	private contentRoot: HTMLElement

	constructor() {
		super()
		const shadow = this.attachShadow({ mode: 'open' })
		shadow.adoptedStyleSheets = [markdownPreviewStyleSheet, tableStyleSheet]
		this.contentRoot = document.createElement('article')
		this.contentRoot.className = 'note'
		shadow.appendChild(this.contentRoot)
		this.addEventListener('click', this.onClick)
		this.addEventListener('dblclick', this.onClick)
		this.addEventListener('mousedown', this.onClick)
		this.addEventListener('contextmenu', this.onClick)
	}

	static get observedAttributes() {
		return ['model', 'filepath']
	}

	attributeChangedCallback(name: string, oldValue: string, newValue: string) {
		if (newValue === oldValue) return
		this.updatePreview()
	}

	updatePreview() {
		const model = JSON.parse(this.getAttribute('model') ?? 'null') as TableModel
		this.contentRoot.replaceChildren()
		if (!model) return
		const table = document.createElement('table')
		const filepath = this.getAttribute('filepath') ?? undefined
		table.spellcheck = false
		if (model.caption) {
			const caption = table.createCaption()
			renderMarkdown(caption, model.caption.markdown, model.caption.contentType, { filepath })
		}
		for (const [name, rows] of [['thead', model.head], ['tbody', model.body], ['tfoot', model.foot]] as const) {
			if (!rows.length) continue
			const section = document.createElement(name)
			this.renderRows(section, rows, model, name === 'thead', filepath)
			table.appendChild(section)
		}
		this.contentRoot.appendChild(table)
	}

	private renderRows(section: HTMLElement, rows: TableRow[], model: TableModel, header: boolean, filepath?: string) {
		const occupied = model.columns.map(() => 0)
		for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
			const row = document.createElement('tr')
			let column = 0
			for (const cell of rows[rowIndex].cells) {
				while (column < occupied.length && occupied[column]) column++
				if (column === occupied.length) break
				const columnSpan = Math.min(Math.max(1, cell.columnSpan), occupied.length - column)
				const rowSpan = Math.min(Math.max(1, cell.rowSpan), rows.length - rowIndex)
				const node = document.createElement(header ? 'th' : 'td')
				node.colSpan = columnSpan
				node.rowSpan = rowSpan
				const alignment = cell.alignment === undefined ? model.columns[column].alignment : cell.alignment
				if (alignment) node.style.textAlign = alignment
				renderMarkdown(node, cell.markdown, cell.contentType, { filepath })
				row.appendChild(node)
				for (let offset = 0; offset < columnSpan; offset++) occupied[column + offset] = rowSpan
				column += columnSpan
			}
			for (; column < occupied.length; column++) {
				if (!occupied[column]) row.appendChild(document.createElement(header ? 'th' : 'td'))
			}
			section.appendChild(row)
			for (let index = 0; index < occupied.length; index++) occupied[index] = Math.max(0, occupied[index] - 1)
		}
	}

	onClick(event: MouseEvent) {
		if (TangentLink.isTangentLinkEvent(event)) return
		const id = Number(this.getAttribute('data-table-id'))
		markAsSelectionRequest(event, { line: attributes => attributes.table?.id === id })
	}
}

defineCustomElement('t-table-preview', TangentTablePreview)
export default TangentTablePreview
