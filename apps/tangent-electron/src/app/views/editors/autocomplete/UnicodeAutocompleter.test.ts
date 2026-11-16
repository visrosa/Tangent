import { afterEach, describe, expect, it } from 'vitest'
import { Editor, Source } from 'typewriter-editor'
import { TextDocument } from '@typewriter/document'
import { markdownToTextDocument } from 'common/markdownModel/parser'
import UnicodeAutocompleter from './UnicodeAutocompleter'
import autocompleteWithHandlers, { AutocompleteModule } from './autocompleteModule'

function sourceDocument(source: string, caret = source.length) {
	return new TextDocument(markdownToTextDocument(source), [caret, caret])
}

const editors: Editor[] = []
afterEach(() => {
	for (const editor of editors.splice(0)) editor.destroy()
})

describe('keyboard delimiter substitutions', () => {
	it.each([
		['[+', ['⁅']], ['[-', ['⁅']],
		['+]', ['⁆']], ['-]', ['⁆']],
	] as const)('offers candidates for %s when typed or requested', (trigger, options) => {
		const handler = new UnicodeAutocompleter(null)
		const doc = sourceDocument(trigger)
		expect(handler.canActivateFromTyping(trigger[1], doc)).toEqual([0, 2])
		expect(handler.canActivateByRequest(doc)).toEqual([0, 2])
		expect(handler.updateSourceText(trigger, doc)).toBe(true)
		expect(handler.options.value).toEqual(options)
		expect(handler.getCurrentOptionText()).toBe(options[0])
		handler.shiftSelection(1)
		expect(handler.getCurrentOptionText()).toBe(options[0])
	})

	it.each(['[+N+]', '[-N-]', '⁅[+N+]⁆', '[+ Space +]', '😀⹕N-]'])('targets the delimiter immediately before the caret in %s', source => {
		const caret = source.endsWith('⁆') ? source.length - 1 : source.length
		expect(new UnicodeAutocompleter(null).canActivateFromTyping(']', sourceDocument(source, caret))).toEqual([caret - 2, caret])
	})

	it.each(['\\[+', '\\[-', '\\+]', '\\-]'])('ignores escaped delimiter %s', source => {
		expect(new UnicodeAutocompleter(null).canActivateByRequest(sourceDocument(source))).toBe(false)
	})

	it('does not reactivate an earlier keyboard delimiter in the same word', () => {
		const handler = new UnicodeAutocompleter(null)
		expect(handler.canActivateByRequest(sourceDocument('[+N'))).toBe(false)
		expect(handler.canActivateFromTyping('+', sourceDocument('[+N+'))).toBe(false)
		expect(handler.canActivateByRequest(sourceDocument('[+N+]text'))).toBe(false)
	})

	it.each(['arrow->+', 'arrow->]', 'ellipsis..+', '[+arrow->+'])('does not activate an unrelated substitution after typing in %s', source => {
		expect(new UnicodeAutocompleter(null).canActivateFromTyping(source[source.length - 1], sourceDocument(source))).toBe(false)
	})

	it.each([
		'`[+`', '```\n[-\n```', '$[+$',
		'---\nkeys: [+\n---', '[[note|[+]]',
		'[label](https://example.org/[+)', '<span title="[+">',
	])('stays inactive in protected context %s', source => {
		const caret = source.search(/\[[+-]/) + 2
		expect(source.slice(caret - 2, caret)).toMatch(/\[[+-]/)
		expect(new UnicodeAutocompleter(null).canActivateFromTyping(source[caret - 1], sourceDocument(source, caret))).toBe(false)
	})

	it.each([
		['[', '+', 'ArrowUp', '⁅'], ['[', '-', 'ArrowDown', '⁅'],
		['⁅N+', ']', 'ArrowDown', '⁆'], ['⁅N-', ']', null, '⁆'],
	] as const)('accepts a substitution after typing %s%s', (before, typed, arrow, replacement) => {
		const handler = new UnicodeAutocompleter(null)
		const editor = new Editor({ modules: { autocomplete: autocompleteWithHandlers([handler]) } })
		editors.push(editor)
		editor.setRoot(document.createElement('div'))
		editor.set(sourceDocument(before))
		editor.change.insert(before.length, typed).select(before.length + 1).apply(Source.input)
		const autocomplete = editor.modules.autocomplete as AutocompleteModule
		expect(autocomplete.activeHandler.value).toBe(handler)
		expect(autocomplete.range.value).toEqual([before.length - 1, before.length + 1])
		if (arrow) editor.root.dispatchEvent(new KeyboardEvent('shortcut', { key: arrow, cancelable: true }))
		editor.root.dispatchEvent(new KeyboardEvent('shortcut', { key: 'Enter', cancelable: true }))
		expect(editor.getText()).toBe(before.slice(0, -1) + replacement)
		expect(autocomplete.activeHandler.value).toBeNull()
	})

	it.each([['+', 'Enter'], ['-', 'Tab']] as const)('converts a complete ASCII %s pair only when each suggestion is accepted with %s', (sign, accept) => {
		const handler = new UnicodeAutocompleter(null)
		const editor = new Editor({ modules: { autocomplete: autocompleteWithHandlers([handler]) } })
		editors.push(editor)
		editor.setRoot(document.createElement('div'))
		editor.set(sourceDocument('['))
		const type = (char: string) => {
			const caret = editor.doc.selection[0]
			editor.change.insert(caret, char).select(caret + char.length).apply(Source.input)
		}
		const acceptSuggestion = () => editor.root.dispatchEvent(new KeyboardEvent('shortcut', { key: accept, cancelable: true }))
		type(sign)
		expect(editor.getText()).toBe('[' + sign)
		acceptSuggestion()
		expect(editor.getText()).toBe('⁅')
		for (const char of ['N', sign, ']']) type(char)
		expect(editor.getText()).toBe('⁅N' + sign + ']')
		expect(markdownToTextDocument(editor.getText()).lines[0].content.ops.some(op => op.attributes?.keyboard)).toBe(false)
		acceptSuggestion()
		expect(editor.getText()).toBe('⁅N⁆')
		expect(markdownToTextDocument(editor.getText()).lines[0].content.ops[0].attributes.keyboard.children).toEqual(['N'])
	})

	it.each(['+', '-'])('keeps the ASCII %s form literal when its suggestion is dismissed', sign => {
		const handler = new UnicodeAutocompleter(null)
		const editor = new Editor({ modules: { autocomplete: autocompleteWithHandlers([handler]) } })
		editors.push(editor)
		editor.setRoot(document.createElement('div'))
		const before = '[' + sign + 'N' + sign
		editor.set(sourceDocument(before))
		editor.change.insert(before.length, ']').select(before.length + 1).apply(Source.input)
		expect((editor.modules.autocomplete as AutocompleteModule).activeHandler.value).toBe(handler)
		editor.root.dispatchEvent(new KeyboardEvent('shortcut', { key: 'Escape', cancelable: true }))
		expect(editor.getText()).toBe(before + ']')
		expect((editor.modules.autocomplete as AutocompleteModule).activeHandler.value).toBeNull()
		expect(markdownToTextDocument(editor.getText()).lines[0].content.ops.some(op => op.attributes?.keyboard)).toBe(false)
	})

	it('retains existing arrow, dash and ellipsis suggestions', () => {
		const handler = new UnicodeAutocompleter(null)
		for (const [source, expected] of [['->', '→'], ['x --', '–'], ['..', '…']]) {
			const doc = sourceDocument(source)
			const range = handler.canActivateByRequest(doc)
			expect(range).not.toBe(false)
			if (range) handler.updateSourceText(doc.getText(range), doc)
			expect(handler.getCurrentOptionText()).toBe(expected)
		}
	})
})
