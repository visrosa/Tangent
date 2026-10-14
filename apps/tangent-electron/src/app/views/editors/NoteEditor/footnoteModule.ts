import { type Editor, Source } from 'typewriter-editor'
import { normalizeFootnoteKey, resolveFootnotes } from 'common/markdownModel/footnotes'
import './t-footnote'
import type TangentFootnote from './t-footnote'

export function footnoteModule(editor: Editor) {
	let document = null
	let notes = resolveFootnotes([])
	let queued = false
	let disposed = false
	const origins = new Map<string, { lineId: string, group?: string }>()
	const elements = new Set<TangentFootnote>()
	function resolve(event: Event) {
		event.stopPropagation()
		elements.add(event.composedPath()[0] as TangentFootnote)
		schedule()
	}
	function update() {
		queued = false
		if (disposed || !editor.root) return
		if (document !== editor.doc.lines) {
			document = editor.doc.lines
			notes = resolveFootnotes(editor.doc.lines)
		}
		const lineElements = Array.from(editor.root.querySelectorAll('.line'))
		for (const element of Array.from(editor.root.querySelectorAll<TangentFootnote>('t-footnote'))) elements.add(element)
		for (const element of elements) {
			if (!element.isConnected || !editor.root.contains(outerHost(element, editor.root))) {
				elements.delete(element)
				continue
			}
			let note = notes.get(normalizeFootnoteKey(element.getAttribute('footnote-key'))) ?? null
			if (note && element.hasAttribute('footnote-definition')) {
				const index = lineElements.indexOf(element.closest('.line'))
				const line = editor.doc.lines[index]
				if (line && editor.doc.getLineRange(line)[0] !== note.start) note = null
			}
			element.update(note)
		}
	}
	function schedule() {
		if (queued) return
		queued = true
		queueMicrotask(update)
	}
	function navigate(event: CustomEvent<{ element: TangentFootnote }>) {
		event.stopPropagation()
		const element = event.detail.element
		const key = normalizeFootnoteKey(element.getAttribute('footnote-key'))
		const note = resolveFootnotes(editor.doc.lines).get(key)
		if (!note?.number) return
		let target = note.start
		if (element.hasAttribute('footnote-definition')) {
			const origin = origins.get(key)
			const reference = editor.doc.lines.flatMap(line => {
				let offset = editor.doc.getLineRange(line)[0]
				return line.content.ops.map(op => {
					const start = offset
					offset += typeof op.insert === 'string' ? op.insert.length : 1
					return line.id === origin?.lineId && (!origin.group || op.attributes?.hiddenGroup === origin.group) && !op.attributes?.footnote?.definition ? start : -1
				})
			}).find(offset => offset >= 0)
			target = reference ?? note.references[0]
		}
		else {
			// Line identity disambiguates equal line-relative ids in separate lines.
			const host = outerHost(element, editor.root)
			const lineElement = host.closest('.line') ?? host.closest('.output-container')?.querySelector('.line')
			const index = Array.from(editor.root.querySelectorAll('.line')).indexOf(lineElement)
			const line = editor.doc.lines[index]
			const group = element.closest('[data-hidden-group]')?.getAttribute('data-hidden-group')
			if (line) origins.set(key, { lineId: line.id, group: host === element ? group : undefined })
		}
		editor.select(target, Source.api)
		editor.root.focus({ preventScroll: true })
		const handled = !editor.root.dispatchEvent(new CustomEvent('note-position-request', { bubbles: true, cancelable: true, detail: target }))
		if (!handled) {
			const index = editor.doc.lines.indexOf(editor.doc.getLineAt(target))
			editor.root.querySelectorAll('.line')[index]?.scrollIntoView({ block: 'nearest' })
		}
	}
	const observer = new MutationObserver(schedule)
	return {
		init() {
			editor.on('changed', schedule)
			editor.root.addEventListener('footnote-resolve', resolve)
			editor.root.addEventListener('footnote-navigate', navigate as EventListener)
			observer.observe(editor.root, { childList: true, subtree: true })
			schedule()
		},
		destroy() {
			disposed = true
			observer.disconnect()
			editor.off('changed', schedule)
			editor.root?.removeEventListener('footnote-resolve', resolve)
			editor.root?.removeEventListener('footnote-navigate', navigate as EventListener)
		}
	}
}

function outerHost(element: HTMLElement, editorRoot: HTMLElement): HTMLElement {
	let root = element.getRootNode()
	while (root instanceof ShadowRoot && !editorRoot.contains(element)) {
		element = root.host as HTMLElement
		root = element.getRootNode()
	}
	return element
}
