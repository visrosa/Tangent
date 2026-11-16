import { Workspace } from 'app/model'
import { type AutocompleteHandler, AutocompleteModule } from './autocompleteModule'
import { Editor, type EditorRange, TextDocument, normalizeRange } from 'typewriter-editor'
import { lineToText } from 'common/typewriterUtils'
import { WritableStore } from 'common/stores'
import { findCharactersBetweenWhitespace } from 'common/stringUtils'
import { wrappedIndex } from 'common/collections'
import { quotationSuggestion, remarkQuotation, seriesFromSettings, type QuotationSeries } from 'common/quotations'
import { resolveFromSettings, resolveSubstitutions, type SubstitutionMode } from 'common/substitutions'

type MatcherItem = {
	match: RegExp
	replace: string[]
	/** A way to dodge away from `---` markdown formatting collisions */
	mustBeMidLine?: boolean
	/** Matched against the line up to the caret rather than the word under it */
	atCaret?: boolean
	/** The rule's mode for a substitution pair; none means always offered */
	mode?: SubstitutionMode
	/** Set on a substitution whose source the user edited */
	customSource?: boolean
	source?: string
}

/** Keycap delimiters are not substitution pairs, so no group setting gates them. */
const keycapDelimiterRules: MatcherItem[] = [
	{ match: /\[[+-]$/, replace: ['⁅'], atCaret: true },
	{ match: /[+-]\]$/, replace: ['⁆'], atCaret: true }
]

/** What the popup consults when no workspace settings exist: every built-in, suggesting */
const fallbackRules = resolveSubstitutions({ arrows: 'suggest', dashes: 'suggest', ellipsis: 'suggest' }, {})

const activateChars = '-><.=+]"\''

const quoteChars = '"\''

export default class UnicodeAutocompleter implements AutocompleteHandler {
	workspace: Workspace
	autocomplete: AutocompleteModule
	editor: Editor

	options: WritableStore<string[]> = new WritableStore([])
	selectedOption: WritableStore<string> = new WritableStore(null)

	/**
	 * Where a substitution set to Auto-Replace is not applied (the filename editor
	 * cannot undo one with Esc), it is offered as a suggestion instead.
	 */
	private autoReplaces: boolean

	constructor(workspace: Workspace, options?: { autoReplace?: boolean }) {
		this.workspace = workspace
		this.autoReplaces = options?.autoReplace ?? true
	}

	init(autocomplete: AutocompleteModule) {
		this.autocomplete = autocomplete
		this.editor = autocomplete.editor
	}

	/** Set while the active range is a quotation (or lone apostrophe) awaiting a choice */
	private quoteSeries: QuotationSeries | null = null

	/** Whether typing the rule's source opens the suggestion popup */
	private isEnabled(matcher: MatcherItem) {
		return !matcher.mode || this.offersSuggestion(matcher.mode)
	}

	/** The substitutions in force, longest source first, after the always-on keycap rules */
	private rules(): MatcherItem[] {
		const settings = this.workspace?.settings
		return [...keycapDelimiterRules, ...(settings ? resolveFromSettings(settings) : fallbackRules)]
	}

	private offersSuggestion(mode: string) {
		return mode === 'suggest' || (mode === 'auto' && !this.autoReplaces)
	}

	private currentSeries(): QuotationSeries {
		const settings = this.workspace.settings
		return seriesFromSettings(
			settings.quotationPreset.value,
			{
				primaryOpen: settings.quotationCustomPrimaryOpen.value,
				primaryClose: settings.quotationCustomPrimaryClose.value,
				secondaryOpen: settings.quotationCustomSecondaryOpen.value,
				secondaryClose: settings.quotationCustomSecondaryClose.value
			},
			typeof navigator !== 'undefined' ? navigator.languages : []
		)
	}

	canActivateFromTyping(char: string, doc: TextDocument): false | EditorRange {
		if (quoteChars.includes(char)) {
			if (!this.offersSuggestion(this.workspace?.settings.typographicQuotes.value)) return false
			return this.tryToActivateQuote(char, doc)
		}
		// An edited source may end in a character the built-ins never use
		if (activateChars.includes(char) || this.rules().some(r => r.customSource && r.source?.endsWith(char))) {
			return this.tryToActivate(doc, true, char === '+' || char === ']')
		}
		return false
	}

	canActivateByRequest(doc: TextDocument): false | EditorRange {
		return this.tryToActivate(doc)
	}

	/**
	 * Activates over a whole completed quotation: typing the closing `"` of `"teste"`
	 * controls the range from the opener to the cursor, so one choice re-marks both ends.
	 * An opening mark alone offers nothing; a lone `'` after a letter offers an apostrophe.
	 */
	tryToActivateQuote(char: string, doc: TextDocument): false | EditorRange {
		this.quoteSeries = null
		const selection = normalizeRange(doc.selection)
		if (!selection || selection[0] != selection[1] || selection[0] < 1) return false

		const line = doc.getLineAt(selection[0])
		if (line.attributes.code) return false
		const formats = doc.getFormats(selection[0] - 1)
		if (formats.inline_code) return false

		const [lineStart] = doc.getLineRange(line)
		const text = doc.getText([lineStart, selection[0]])
		if (!text.endsWith(char)) return false

		const series = this.currentSeries()
		const suggestion = quotationSuggestion(text, char, series)
		if (!suggestion) return false

		// An opener inside inline code would make the span cross a code boundary
		for (let i = lineStart + suggestion.start; i < selection[0]; i++) {
			if (doc.getFormats(i).inline_code) return false
		}

		this.quoteSeries = series
		return [lineStart + suggestion.start, selection[0]]
	}

	tryToActivate(doc: TextDocument, autoActivate=false, atCaretOnly=false): false | EditorRange {
		this.quoteSeries = null
		const selection = normalizeRange(doc.selection)
		if (!selection || selection[0] != selection[1]) return false

		const line = doc.getLineAt(selection[0])
		if (line.attributes.code) return false

		// Use the format data of the previous character to "dead recon" this one
		// as the new character will not yet be formatted.
		const formats = doc.getFormats(selection[0] - 1)
		if (formats.inline_code) return false
		
		const [lineStart] = doc.getLineRange(line)
		const lineText = lineToText(line)

		const [wordStart, wordEnd] = findCharactersBetweenWhitespace(lineText, selection[0] - lineStart)
		const text = doc.getText([lineStart + wordStart, lineStart + wordEnd])

		for (const matcher of this.rules()) {
			if (atCaretOnly && !matcher.atCaret) continue
			if (!this.isEnabled(matcher)) continue
			const matchText = matcher.atCaret ? lineText.slice(0, selection[0] - lineStart) : text
			const match = matchText.match(matcher.match)
			if (match) {
				const matchStart = (matcher.atCaret ? 0 : wordStart) + match.index
				if (matcher.atCaret) {
					if (formats.math || formats.t_link || formats.link_internal || formats.code_syntax ||
						line.attributes.front_matter || line.attributes.math || line.attributes.html) continue
					let backslashes = 0
					for (let index = matchStart - 1; index >= 0 && lineText[index] === '\\'; index--) backslashes++
					if (backslashes % 2) continue
				}
				if (autoActivate && matcher.mustBeMidLine && wordStart === 0 && match.index === 0) {
					continue
				}
				const start = lineStart + matchStart
				const end = start + match[0].length
				return [start, end]
			}
		}

		return false
	}

	updateSourceText(text: string, doc: TextDocument): boolean {
		// Ignore all updates but the first one

		if (this.quoteSeries) {
			// A lone apostrophe is offered as U+2019; anything longer must still be an intact quotation
			const remarked = text === "'" ? '\u2019' : remarkQuotation(text, this.quoteSeries)
			if (!remarked) return false
			this.options.set([remarked])
			this.selectedOption.set(remarked)
			return true
		}

		for (const matcher of this.rules()) {
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
