import type { TextDocument } from '@typewriter/document'
import { safeHeaderLine } from 'common/markdownModel/header'
import { lineToText } from 'common/typewriterUtils'

export type NoteOutlineControl = { expanded: boolean; toggle: () => void }

export type OutlineHeading = { id: string, index: number, start: number, level: number, depth: number, text: string }

export function getOutlineHeadings(doc: TextDocument): OutlineHeading[] {
	const headings: OutlineHeading[] = []
	const levels: number[] = []
	let start = 0
	doc.lines.forEach((line, index) => {
		const level = line.attributes.header
		if (level && !line.attributes.footnoteDefinition) {
			while (levels.length && levels.at(-1) >= level) levels.pop()
			const depth = levels.length
			levels.push(level)
			const outputs = new Set<string>()
			const text = line.content.ops.map(op => {
				const attr = op.attributes ?? {}
				if ((attr.furigana || attr.math) && typeof attr.hiddenGroup === 'string') {
					if (outputs.has(attr.hiddenGroup)) return ''
					outputs.add(attr.hiddenGroup)
				}
				if (attr.furigana) return attr.furigana.base
				if (attr.math) return attr.math.source
				if (attr.hidden || attr.line_format || attr.footnote) return ''
				return typeof op.insert === 'string' ? op.insert : ''
			}).join('').trim()
			headings.push({ id: line.id, index, start, level, depth, text: text || safeHeaderLine(lineToText(line)) || 'Untitled section' })
		}
		start += line.length
	})
	return headings
}

export function headingAtPosition(headings: OutlineHeading[], position: number): string {
	let id: string = null
	for (const heading of headings) {
		if (heading.start > position) break
		id = heading.id
	}
	return id
}
