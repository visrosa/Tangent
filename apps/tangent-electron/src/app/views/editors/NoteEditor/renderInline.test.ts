import { describe, test, expect } from 'vitest'

import { Editor, inlineToHTML } from 'typewriter-editor'
import { Delta } from '@typewriter/delta'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import { parseMarkdown } from 'common/markdownModel/parser'

function getEditor() {
	const editor = new Editor({ types: noteTypeset })
	editor.setRoot(document.createElement('div'))
	return editor
}

function containerCount(html: string, name = 'math') {
	return (html.match(new RegExp(`inline-${name}-container`, 'g')) ?? []).length
}

function elementCount(html: string, name: string) {
	return (html.match(new RegExp(`<${name}`, 'g')) ?? []).length
}

describe('renderInline: adjacent hidden-group embeds', () => {
	test('Distinct instances with the same source render as two containers', () => {
		const editor = getEditor()
		const delta = new Delta([
			{ insert: '$a$', attributes: { math: { source: 'a', instance: '0-3' }, hiddenGroup: true } },
			{ insert: '$a$', attributes: { math: { source: 'a', instance: '3-6' }, hiddenGroup: true } }
		])

		expect(containerCount(inlineToHTML(editor, delta))).toBe(2)
	})

	test('Distinct furigana instances with the same content render as two containers', () => {
		const editor = getEditor()
		const delta = new Delta([
			{ insert: '{a|b}', attributes: { furigana: { base: 'a', reading: 'b', instance: '0-5' }, hiddenGroup: true } },
			{ insert: '{a|b}', attributes: { furigana: { base: 'a', reading: 'b', instance: '5-10' }, hiddenGroup: true } }
		])

		expect(containerCount(inlineToHTML(editor, delta), 'furigana')).toBe(2)
	})

	test('Decorations splitting one furigana instance do not duplicate its output', () => {
		const editor = getEditor()
		const furigana = { base: 'Mr. Smith', reading: 'ミスター・スミス', instance: '0-20' }
		const delta = new Delta([
			{
				insert: '{Mr.',
				attributes: { furigana, hiddenGroup: true, decoration: { focus: { class: 'unfocused' } } }
			},
			{
				insert: ' Smith|ミスター・スミス}',
				attributes: { furigana, hiddenGroup: true, decoration: { focus: { class: 'focused' } } }
			}
		])
		const html = inlineToHTML(editor, delta)

		expect(containerCount(html, 'furigana')).toBe(1)
		expect(elementCount(html, 't-furigana')).toBe(1)
	})
})

describe('renderInline: adjacent embeds', () => {
	test('Distinct embed instances render as distinct outputs', () => {
		const editor = getEditor()
		const delta = parseMarkdown('![[a.png]]![[b.png]]').lines[0].content
		const html = inlineToHTML(editor, delta)

		expect(html.match(/<t-embed/g)).toHaveLength(2)
	})
})
