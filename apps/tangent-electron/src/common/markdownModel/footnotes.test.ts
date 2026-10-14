import { describe, expect, it } from 'vitest'
import { TextDocument } from '@typewriter/document'
import { StructureType } from 'common/indexing/indexTypes'
import { parseMarkdown } from './parser'
import { resolveFootnotes } from './footnotes'
import { typewriterToText } from 'common/typewriterUtils'

describe('footnotes', () => {
	it('numbers by first use, shares repeated references, and preserves source', () => {
		const source = 'Text[^B] and [^a] again[^b].\n\n[^a]: Alpha\n[^B]: Beta'
		const result = parseMarkdown(source)
		const notes = resolveFootnotes(result.lines)
		expect(notes.get('b')).toMatchObject({ number: 1, text: 'Beta', references: [4, 23] })
		expect(notes.get('a').number).toBe(2)
		expect(typewriterToText(result.lines)).toBe(source)
		expect(result.structure).toEqual([])
	})
	it('includes indented continuation paragraphs and links in the index', () => {
		const source = 'Text[^文].\n\n[^文]: First **bold**\n    next [link](https://example.com)\n\n    second paragraph\n\n# Outside'
		const result = parseMarkdown(source, { filepath: '/notes/example.md' })
		expect(resolveFootnotes(result.lines).get('文').text).toBe('First **bold**\nnext [link](https://example.com)\n\nsecond paragraph\n')
		expect(result.structure.some(item => item.type === StructureType.Link)).toBe(true)
		expect(result.lines.at(-1).attributes.header).toBe(1)
		expect(typewriterToText(result.lines)).toBe(source)
	})
	it('uses the first duplicate definition and leaves unused notes unnumbered', () => {
		const notes = resolveFootnotes(parseMarkdown('x[^a]\n[^a]: first\n[^a]: second\n[^unused]: spare').lines)
		expect(notes.get('a').text).toBe('first')
		expect(notes.get('unused').number).toBeUndefined()
	})
	it('leaves escaped, code, frontmatter and malformed markers inert', () => {
		const source = '---\nx: "[^yaml]"\n---\n\\[^escape] `[^code]` [^] [^two words]\n```md\n[^fenced]: text\n```'
		const result = parseMarkdown(source)
		expect(result.lines.flatMap(line => line.content.ops).filter(op => op.attributes?.footnote)).toEqual([])
		expect(typewriterToText(result.lines)).toBe(source)
	})
	it('reparses continuation lines when a definition is created or removed', () => {
		const original = new TextDocument(parseMarkdown('plain\n    continuation\n# After').lines)
		const created = original.apply(original.change.delete([0, 5]).insert(0, '[^a]: body').delta)
		const result = parseMarkdown(created, { documentStartLine: 0, documentEndLine: 0 })
		expect(result.lines[1].attributes.footnoteDefinition.key).toBe('a')
		const document = new TextDocument(result.lines)
		const removed = document.apply(document.change.delete([0, 10]).insert(0, 'plain').delta)
		const reparsed = parseMarkdown(removed, { documentStartLine: 0, documentEndLine: 0 })
		expect(reparsed.lines[1].attributes.footnoteDefinition).toBeUndefined()
	})
})
