import { describe, expect, it } from 'vitest'
import { TextDocument } from '@typewriter/document'
import { typewriterToText } from 'common/typewriterUtils'
import { StructureType } from 'common/indexing/indexTypes'
import { parseGridTable } from './gridTable'
import { markdownToTextDocument, parseMarkdown } from './parser'

const basic = '+-----+-----+\n| A   | B   |\n+=====+=====+\n| a   | b   |\n+-----+-----+'
const spans = `+---------------------+----------+
| Property            | Earth    |
+=============+=======+==========+
|             | min   | -89.2 °C |
| Temperature +-------+----------+
| 1961-1990   | mean  | 14 °C    |
|             +-------+----------+
|             | max   | 56.7 °C  |
+-------------+-------+----------+`

describe('Grid tables', () => {
	it('parses headers, body rows and inferred columns underneath a spanning header', () => {
		const model = parseGridTable(spans)
		expect(model.columns).toHaveLength(3)
		expect(model.head[0].cells[0]).toMatchObject({ markdown: 'Property', columnSpan: 2 })
		expect(model.body).toHaveLength(3)
		expect(model.body[0].cells[0]).toMatchObject({ markdown: 'Temperature\n1961-1990', rowSpan: 3, contentType: 'block' })
		expect(model.body[1].cells.map(cell => cell.markdown)).toEqual(['mean', '14 °C'])
	})

	it('supports several header rows, foot and formatted captions', () => {
		const source = ': A **caption**\n\n+-----+-----+\n| H   | H   |\n+-----+-----+\n| h   | h   |\n+=====+=====+\n| a   | b   |\n+=====+=====+\n| f   | f   |\n+=====+=====+'
		const model = parseGridTable(source)
		expect(model.head).toHaveLength(2)
		expect(model.body).toHaveLength(1)
		expect(model.foot[0].cells.map(cell => cell.markdown)).toEqual(['f', 'f'])
		expect(model.caption.markdown).toBe('A **caption**')
		expect(parseGridTable(basic + '\n\n: After').caption.markdown).toBe('After')
	})

	it('omits a single empty header as Pandoc does', () => {
		const model = parseGridTable(basic.replace('| A   | B   |', '|     |     |'))
		expect(model.head).toHaveLength(0)
		expect(model.body).toHaveLength(1)
	})

	it('discovers column boundaries and row spans below a combined heading', () => {
		const model = parseGridTable('+-----+-----------+\n| H   | Group     |\n|     +-----+-----+\n|     | min | max |\n+=====+=====+=====+\n| a   | b   | c   |\n+-----+-----+-----+')
		expect(model.columns).toHaveLength(3)
		expect(model.head).toHaveLength(2)
		expect(model.head[0].cells.map(cell => [cell.rowSpan, cell.columnSpan])).toEqual([[2, 1], [1, 2]])
		expect(model.head[1].cells.map(cell => cell.markdown)).toEqual(['min', 'max'])
	})

	it.each(['-', '='])('reads alignment colons on %s borders', marker => {
		const source = '+----:+:----+:---:+\n| R   | L   | C   |\n' + (marker === '=' ? '+====:+:====+:===:+\n| r   | l   | c   |\n' : '') + '+-----+-----+-----+'
		expect(parseGridTable(source).columns.map(column => column.alignment)).toEqual(['right', 'left', 'center'])
	})

	it('retains block indentation, paragraphs, lists, code and literal pipes', () => {
		const source = '+----------------+\n| paragraph      |\n|                |\n| - one          |\n| - two          |\n|                |\n|     a | b      |\n+----------------+'
		expect(parseGridTable(source).body[0].cells[0].markdown).toBe('paragraph\n\n- one\n- two\n\n    a | b')
	})

	it('uses display columns for wide and combining characters', () => {
		const source = '+-----+-----+\n| 漢  | e\u0301   |\n+-----+-----+'
		expect(parseGridTable(source).body[0].cells.map(cell => cell.markdown)).toEqual(['漢', 'e\u0301'])
	})

	it('follows Pandoc when an internal pipe shifts or the last border is short', () => {
		expect(parseGridTable('+-----+-----+\n| a    | b  |\n+-----+-----+').body[0].cells[0]).toMatchObject({ markdown: 'a    | b', columnSpan: 2 })
		expect(parseGridTable('+-----+-----+\n| a   | b  |\n+-----+-----+').body[0].cells[1].markdown).toBe('b  |')
		expect(parseGridTable('+-----+-----+\n| a   | b    |\n+-----+-----+').body[0].cells[1].markdown).toBe('b')
	})

	it.each(['+-----+\n| a   |', '+---x-+\n| a   |\n+-----+', 'paragraph', '+-----+'])('leaves an untraceable grid as ordinary text: %s', source => {
		expect(parseGridTable(source)).toBeNull()
	})

	it.each([basic, spans, ': Caption\n\n' + basic, basic + '\n\n: Caption', basic.split('\n').map(line => '  ' + line).join('\n')])('keeps physical source lines verbatim: %s', source => {
		const doc = markdownToTextDocument('before\n' + source + '\nafter')
		expect(typewriterToText(doc)).toBe('before\n' + source + '\nafter')
		expect(doc.lines.slice(1, -1).every(line => line.attributes.table?.id === 1)).toBe(true)
		expect(doc.lines[0].attributes.table).toBeUndefined()
		expect(doc.lines.at(-1).attributes.table).toBeUndefined()
		expect(doc.lines[1].attributes.table.model).toEqual(parseGridTable(source))
	})

	it('indexes block cell Markdown against physical source offsets', () => {
		const source = '+------------------------+\n| [[note]]               |\n|                        |\n| - [site](./other.md)   |\n| - #tag                 |\n+------------------------+\n\n: [[caption]]'
		const result = parseMarkdown(source, { detailedLinks: true, filepath: '/workspace/source.md' })
		const links = result.structure.filter(entry => entry.type === StructureType.Link)
		expect(links.map(link => source.slice(link.start, link.end))).toEqual(['[[note]]', '[site](./other.md)', '[[caption]]'])
		expect(result.structure.find(entry => entry.type === StructureType.Tag)?.href).toBe('tag')
	})

	it('reparses the full group after a scoped cell edit without merging another table', () => {
		const doc = markdownToTextDocument('before\n' + basic + '\n\n' + basic)
		const result = parseMarkdown(doc, { documentStartLine: 4, documentEndLine: 4 })
		expect(result.startLineIndex).toBe(1)
		expect(result.lines.map(line => line.attributes.table.id)).toEqual([1, 1, 1, 1, 1])
		const index = doc.getLineRange(doc.lines[4])[0] + 2
		const edited = doc.apply(doc.change.delete([index, index + 1]).insert(index, 'z'))
		const changed = parseMarkdown(edited, { documentStartLine: 4, documentEndLine: 4 })
		expect(changed.lines[0].attributes.table.model.body[0].cells[0].markdown).toBe('z')
		expect(typewriterToText(new TextDocument(changed.lines))).toBe(basic.replace('| a', '| z'))
	})

	it('recognizes a newly completed grid during a scoped border edit', () => {
		const source = basic.slice(1)
		const doc = markdownToTextDocument(source)
		const edited = doc.apply(doc.change.insert(0, '+'))
		const result = parseMarkdown(edited, { documentStartLine: 0, documentEndLine: 0 })
		expect(result.lines).toHaveLength(5)
		expect(result.lines.every(line => line.attributes.table?.id === 0)).toBe(true)
	})
})
