import { Workspace } from 'app/model'
import { type AutocompleteHandler, AutocompleteModule } from './autocompleteModule'
import { Editor, type EditorRange, TextDocument, normalizeRange } from 'typewriter-editor'
import { lineToText } from 'common/typewriterUtils'
import { WritableStore } from 'common/stores'
import { findCharactersBetweenWhitespace } from 'common/stringUtils'
import { wrappedIndex } from 'common/collections'
import { quotationOptions, seriesFromSettings } from 'common/quotations'

type MatcherItem = {
	match: RegExp,
	replace: string|string[],
	mustBeMidLine?: boolean // This is a way to dodge away from `---` markdown formatting collisions
	/** The substitution setting that can turn this rule off */
	group?: 'arrows' | 'dashes' | 'ellipsis'
}

const matches: MatcherItem[] = [
	{
		match: /--+>/,
		replace: [
			'➞',
			'➝',
			'→',
			'⟶',
		],
		group: 'arrows'
	},
	{
		match: /->/,
		replace: [
			'→',
			'➝',
			'➞',
			'⟶'
		],
		group: 'arrows'
	},
	{
		match: /<--+/,
		replace: [
			'⟵',
			'←'
		],
		group: 'arrows'
	},
	{
		match: /<-/,
		replace: [
			'←',
			'⟵'
		],
		group: 'arrows'
	},
	{
		match: /==>/,
		replace: [
			'⟹',
			'⇒',
		],
		group: 'arrows'
	},
	{
		match: /=>/,
		replace: [
			'⇒',
			'⟹',
		],
		group: 'arrows'
	},
	{
		match: /<==/,
		replace: [
			'⟸',
			'⇐',
		],
		group: 'arrows'
	},
	{
		match: /<=/,
		replace: [
			'⇐',
			'⟸',
		],
		group: 'arrows'
	},
	{
		match: /---/,
		replace: [
			'—',
			'–'
		],
		mustBeMidLine: true,
		group: 'dashes'
	},
	{
		match: /--/,
		replace: [
			'–',
			'—'
		],
		mustBeMidLine: true,
		group: 'dashes'
	},
	{
		match: /\.\.+/, // Only require two periods so that overall keystroke is the same as three (. . enter)
		replace: ['…'],
		group: 'ellipsis'
	}
]

const activateChars = '-><.="\''

const quoteChars = '"\''

export default class UnicodeAutocompleter implements AutocompleteHandler {
	workspace: Workspace
	autocomplete: AutocompleteModule
	editor: Editor

	options: WritableStore<string[]> = new WritableStore([])
	selectedOption: WritableStore<string> = new WritableStore(null)

	constructor(workspace: Workspace) {
		this.workspace = workspace
	}

	init(autocomplete: AutocompleteModule) {
		this.autocomplete = autocomplete
		this.editor = autocomplete.editor
	}

	/** The character before a quotation mark awaiting a choice, or undefined at the start of a line */
	private quoteContext: { before: string | undefined } | null = null

	private isEnabled(matcher: MatcherItem) {
		const settings = this.workspace?.settings
		if (!settings || !matcher.group) return true
		switch (matcher.group) {
			case 'arrows': return settings.arrowSubstitutions.value !== 'off'
			case 'dashes': return settings.dashSubstitutions.value !== 'off'
			case 'ellipsis': return settings.ellipsisSubstitutions.value !== 'off'
		}
		return true
	}

	private quotationOptions(mark: string): string[] {
		const settings = this.workspace.settings
		const series = seriesFromSettings(
			settings.quotationPreset.value,
			{
				primaryOpen: settings.quotationCustomPrimaryOpen.value,
				primaryClose: settings.quotationCustomPrimaryClose.value,
				secondaryOpen: settings.quotationCustomSecondaryOpen.value,
				secondaryClose: settings.quotationCustomSecondaryClose.value
			},
			typeof navigator !== 'undefined' ? navigator.languages : []
		)
		return quotationOptions(mark, this.quoteContext?.before, series)
	}

	canActivateFromTyping(char: string, doc: TextDocument): false | EditorRange {
		if (quoteChars.includes(char)) {
			if (!this.workspace?.settings.typographicQuotes.value) return false
			return this.tryToActivateQuote(char, doc)
		}
		if (activateChars.includes(char)) {
			return this.tryToActivate(doc, true)
		}
		return false
	}

	canActivateByRequest(doc: TextDocument): false | EditorRange {
		return this.tryToActivate(doc)
	}

	tryToActivateQuote(char: string, doc: TextDocument): false | EditorRange {
		const selection = normalizeRange(doc.selection)
		if (!selection || selection[0] != selection[1] || selection[0] < 1) return false

		const line = doc.getLineAt(selection[0])
		if (line.attributes.code) return false
		const formats = doc.getFormats(selection[0] - 1)
		if (formats.inline_code) return false

		const start = selection[0] - 1
		if (doc.getText([start, selection[0]]) !== char) return false

		const [lineStart] = doc.getLineRange(line)
		this.quoteContext = {
			before: start > lineStart ? doc.getText([start - 1, start]) : undefined
		}
		return [start, selection[0]]
	}

	tryToActivate(doc: TextDocument, autoActivate=false): false | EditorRange {
		this.quoteContext = null
		const selection = normalizeRange(doc.selection)
		if (!selection || selection[0] != selection[1]) return false

		const line = doc.getLineAt(selection[0])
		if (line.attributes.code) return false

		// Use the format data of the previous character to "dead recon" this one
		// as the new character will not yet be formatted.
		const formats = doc.getFormats(selection[0] - 1)
		if (formats.inline_code) return false
		
		const [lineStart, lineEnd] = doc.getLineRange(line)
		const lineText = lineToText(line)

		const [wordStart, wordEnd] = findCharactersBetweenWhitespace(lineText, selection[0] - lineStart)
		const text = doc.getText([lineStart + wordStart, lineStart + wordEnd])

		for (const matcher of matches) {
			if (!this.isEnabled(matcher)) continue
			const match = text.match(matcher.match)
			if (match) {
				if (autoActivate && matcher.mustBeMidLine && wordStart === 0 && match.index === 0) {
					continue
				}
				const start = lineStart + wordStart + match.index
				const end = start + match[0].length
				return [start, end]
			}
		}

		return false
	}

	updateSourceText(text: string, doc: TextDocument): boolean {
		// Ignore all updates but the first one

		if (this.quoteContext && quoteChars.includes(text) && text.length === 1) {
			this.options.set(this.quotationOptions(text))
			this.selectedOption.set(this.options.value[0])
			return true
		}

		for (const matcher of matches) {
			if (!this.isEnabled(matcher)) continue
			const match = text.match(matcher.match)
			if (match) {
				if (match.index != 0 || match[0].length < text.length) {
					continue
				}
				if (Array.isArray(matcher.replace)) {
					this.options.set(matcher.replace)	
				}
				else {
					this.options.set([matcher.replace as string])
				}
				this.selectedOption.set(this.options.value[0])
				return true
			}
		}

		return false
	}

	getCurrentOptionText() {
		return this.selectedOption.value ?? ''
	}

	applySelection() {
		this.autocomplete.updateAutocomplete(this.getCurrentOptionText())
	}

	shiftSelection(shift: number) {
		let index = this.options.value.indexOf(this.selectedOption.value)
		if (index < 0) {
			index = 0
		}
		
		index = wrappedIndex(this.options.value, index + shift)

		this.selectedOption.set(this.options.value[index])
	}
}
