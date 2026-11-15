import type { Workspace } from 'app/model'
import { Source, type Editor, type EditorChangeEvent, type EditorRange, normalizeRange } from 'typewriter-editor'
import { seriesFromSettings, type QuotationSeries } from 'common/quotations'
import { planAutoReplace, type AutoReplaceModes } from 'common/autoReplace'
import type { SubstitutionMode } from 'common/substitutions'

/** Inline formats and line attributes whose text a substitution must never rewrite. */
const protectedFormats = ['inline_code', 'math', 't_link', 't_embed', 'templateToken', 'code_syntax']
const protectedLines = ['code', 'front_matter', 'math']

/** What an Auto-Replace changed, kept only while Esc or Backspace may still undo it. */
interface AutoReplaceWindow {
	/** Where the replacement starts, and what it replaced */
	start: number
	source: string
	replacement: string
	/** Where the caret must stand for the window to stay open: just after the boundary character */
	caret: number
}

/**
 * Auto-Replace: when a boundary character is typed after a substitution's whole
 * source, the source is replaced by its target (design in
 * `TODO/interface-and-navigation.md#Language & Spelling Settings`).
 *
 * The replacement is applied as a second change, once the keystroke's own change
 * event has finished, so that undo history records it as its own step: Ctrl-Z returns the source and leaves the
 * typed boundary character. Esc and Backspace immediately afterwards do the same
 * through `undoLast`; any other change or caret move ends that window.
 */
export default function autoReplaceModule(editor: Editor, workspace: Workspace) {
	let applying = false
	let lastReplacement: AutoReplaceWindow | null = null

	const settings = () => workspace.settings

	function modes(): AutoReplaceModes {
		const s = settings()
		const groupModes = {
			arrows: s.arrowSubstitutions.value,
			dashes: s.dashSubstitutions.value,
			ellipsis: s.ellipsisSubstitutions.value
		}
		return {
			groups: group => groupModes[group] as SubstitutionMode,
			quotes: s.typographicQuotes.value as SubstitutionMode
		}
	}

	function currentSeries(): QuotationSeries {
		const s = settings()
		return seriesFromSettings(
			s.quotationPreset.value,
			{
				primaryOpen: s.quotationCustomPrimaryOpen.value,
				primaryClose: s.quotationCustomPrimaryClose.value,
				secondaryOpen: s.quotationCustomSecondaryOpen.value,
				secondaryClose: s.quotationCustomSecondaryClose.value
			},
			typeof navigator !== 'undefined' ? navigator.languages : []
		)
	}

	/** The single character a change typed, with the index it landed at, or null for anything else */
	function typedCharacter(event: EditorChangeEvent): { index: number, char: string } | null {
		if (event.source !== Source.input && event.source !== Source.user) return null
		let index = 0
		let found: { index: number, char: string } | null = null
		for (const op of event.change.delta.ops) {
			if (op.delete) return null
			if (op.retain) {
				if (!found) index += op.retain
			}
			else if (typeof op.insert === 'string') {
				if (found) return null
				found = { index, char: op.insert }
			}
			else return null
		}
		return found && found.char.length === 1 ? found : null
	}

	function apply(range: EditorRange, text: string, caret: number) {
		applying = true
		try {
			editor.change
				.delete(range)
				.insert(range[0], text)
				.select(caret)
				.apply()
		}
		finally {
			applying = false
		}
	}

	function onChange(event: EditorChangeEvent) {
		if (applying) return

		const previous = lastReplacement
		lastReplacement = null
		if (!event.change || !event.change.contentChanged) {
			// A selection-only change keeps the window as long as the caret has not moved
			const selection = event.doc.selection && normalizeRange(event.doc.selection)
			if (previous && selection && selection[0] === selection[1] && selection[0] === previous.caret) {
				lastReplacement = previous
			}
			return
		}

		const typed = typedCharacter(event)
		if (!typed) return
		if (editor.modules.input?.isComposing?.()) return

		const doc = event.doc
		const selection = doc.selection && normalizeRange(doc.selection)
		if (!selection || selection[0] !== selection[1] || selection[0] !== typed.index + 1) return
		if (typed.index < 1) return

		const line = doc.getLineAt(typed.index - 1)
		if (protectedLines.some(name => line.attributes[name])) return
		const [lineStart] = doc.getLineRange(line)
		if (typed.index <= lineStart) return

		const before = doc.getText([lineStart, typed.index])
		const plan = planAutoReplace(
			before, typed.char, modes(), currentSeries(),
			offset => {
				const formats = doc.getFormats(lineStart + offset)
				return protectedFormats.some(name => formats[name])
			}
		)
		if (!plan) return

		const start = lineStart + plan.start
		const end = lineStart + plan.end
		const caret = selection[0] + plan.replacement.length - (plan.end - plan.start)
		const source = doc.getText([start, end])

		// Not inside this event: listeners registered after this one, history among
		// them, have yet to see the keystroke, and a nested change would reach them
		// first and leave the undo stack out of order.
		queueMicrotask(() => {
			if (editor.doc !== doc) return
			apply([start, end], plan.replacement, caret)
			lastReplacement = { start, source, replacement: plan.replacement, caret }
		})
	}

	/** Restores the source an Auto-Replace replaced, leaving the boundary character in place */
	function undoLast(): boolean {
		const window = lastReplacement
		lastReplacement = null
		if (!window) return false

		const selection = editor.doc.selection && normalizeRange(editor.doc.selection)
		if (!selection || selection[0] !== selection[1] || selection[0] !== window.caret) return false
		const end = window.start + window.replacement.length
		if (editor.doc.getText([window.start, end]) !== window.replacement) return false

		apply([window.start, end], window.source, window.caret - window.replacement.length + window.source.length)
		return true
	}

	/**
	 * Esc and Backspace undo the replacement. This listens in the capture phase on the
	 * editor so that Esc reaches us before the note's own Esc handling (leaving the
	 * note); anything more salient, such as a focused popup, has focus and never
	 * delivers the key here.
	 */
	function onKeyDown(event: KeyboardEvent) {
		if (event.defaultPrevented || !lastReplacement) return
		if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return
		if (event.key !== 'Escape' && event.key !== 'Backspace') return
		if (editor.modules.autocomplete?.activeHandler?.value) return
		if (undoLast()) {
			event.preventDefault()
			event.stopPropagation()
		}
	}

	return {
		init() {
			editor.on('change', onChange)
			editor.root.addEventListener('keydown', onKeyDown, true)
		},
		destroy() {
			editor.off('change', onChange)
			editor.root.removeEventListener('keydown', onKeyDown, true)
		}
	}
}
