import { Editor, renderDoc, renderInline } from 'typewriter-editor'
import { TextDocument } from '@typewriter/document'
import { patch, type VNode } from 'typewriter-editor/rendering/vdom'
import { parseMarkdown } from 'common/markdownModel/parser'
import noteTypeset from 'common/markdownModel/typewriterTypes'
import noteStyles from 'app/style/note.scss?inline'
import './t-math'
import './t-furigana'

let renderingContext: Editor

export const markdownPreviewStyleSheet = new CSSStyleSheet()
markdownPreviewStyleSheet.replaceSync(noteStyles + '\narticle.note { padding: 0; font-size: inherit; }')

export function renderMarkdown(target: HTMLElement, markdown: string, contentType: 'inline' | 'block' = 'block') {
	// This context supplies the typeset, but never mounts an editable root or modules.
	renderingContext ??= new Editor({ types: noteTypeset })
	const { lines } = parseMarkdown(markdown, { inlineOnly: contentType === 'inline' })
	const nodes = contentType === 'inline'
		? renderInline(renderingContext, lines[0])
		: renderDoc(renderingContext, new TextDocument(lines))
	patch(target, nodes as VNode[])
}
