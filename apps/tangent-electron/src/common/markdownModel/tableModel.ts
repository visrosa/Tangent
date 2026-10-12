export type TableAlignment = 'left' | 'center' | 'right' | null

export type TableCell = {
	markdown: string
	contentType: 'inline' | 'block'
	rowSpan: number
	columnSpan: number
	alignment?: TableAlignment
}

export type TableRow = {
	cells: TableCell[]
}

export type TableModel = {
	columns: { alignment: TableAlignment }[]
	head: TableRow[]
	body: TableRow[]
	foot: TableRow[]
	caption?: { markdown: string, contentType: 'inline' | 'block' }
}
