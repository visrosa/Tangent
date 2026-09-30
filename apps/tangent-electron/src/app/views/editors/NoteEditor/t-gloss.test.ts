import { describe, test, expect } from 'vitest'
import { Editor, inlineToHTML } from 'typewriter-editor'
import { Delta } from '@typewriter/delta'
import type { AttributeMap } from '@typewriter/document'
import type { FormatType } from 'typewriter-editor/typesetting'
import noteTypeset from 'common/markdownModel/typewriterTypes'

import { escapeHtml } from './t-gloss'

function createGloss(base: string, description: string) {
	const el = document.createElement('t-gloss') as HTMLElement & { tooltipConfig(): { tooltip: string } }
	el.setAttribute('base', base)
	el.setAttribute('description', description)
	document.body.appendChild(el)
	return el
}

describe('t-gloss', () => {
	test('renders the base and indicator inside its shadow root only', () => {
		const el = createGloss('SGR', 'Select Graphic Rendition')

		expect(el.shadowRoot.querySelector('.base').textContent).toBe('SGR')
		const indicator = el.shadowRoot.querySelector('.indicator')
		expect(indicator.textContent).toBe('ⓘ')
		expect(indicator.getAttribute('aria-hidden')).toBe('true')
		// Light-DOM text would be counted by Typewriter as document offsets.
		expect(el.childNodes).toHaveLength(0)

		el.remove()
	})

	test('updates shadow content and accessible description when attributes change', () => {
		const el = createGloss('a', 'first')

		el.setAttribute('base', 'b')
		el.setAttribute('description', 'second')

		expect(el.shadowRoot.querySelector('.base').textContent).toBe('b')
		expect(el.getAttribute('aria-description')).toBe('second')
		expect(el.tooltipConfig().tooltip).toBe('second')

		el.remove()
	})

	test('escapes the description before handing it to the HTML tooltip', () => {
		const el = createGloss('x', '<img src=x onerror=alert(1)> & "quoted"')

		expect(el.tooltipConfig().tooltip).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;')
		expect(escapeHtml(`'`)).toBe('&#39;')

		el.remove()
	})

	test('click requests selection matching only this span\'s inline id', () => {
		const group = document.createElement('span')
		group.setAttribute('data-hidden-group', '0-17')
		const el = createGloss('SGR', 'graphics')
		group.appendChild(el)
		document.body.appendChild(group)

		let captured: any
		el.addEventListener('click', event => {
			captured = (event as any).editorSelectionRequest
		})
		el.dispatchEvent(new MouseEvent('click', { bubbles: true }))

		expect(captured.inline({ hiddenGroup: '0-17' })).toBe(true)
		expect(captured.inline({ hiddenGroup: '17-34' })).toBe(false)

		group.remove()
	})

	test('releases its tooltip action when disconnected', () => {
		const el = createGloss('a', 'b') as any
		expect(el.tooltipAction).not.toBeNull()

		el.remove()
		expect(el.tooltipAction).toBeNull()
	})
})

describe('gloss format', () => {
	const glossFormat = noteTypeset.formats.find(
		(format): format is FormatType => typeof format !== 'string' && format.name === 'gloss'
	)

	function render(attributes: AttributeMap) {
		const rendered = glossFormat.render(attributes, ['source'], null, null) as any
		return glossFormat.postProcess?.(rendered) ?? rendered
	}

	test('renders a t-gloss element carrying base and description', () => {
		const rendered = render({ gloss: { base: 'SGR', description: 'graphics' } })

		expect(rendered.children[1]).toMatchObject({
			type: 't-gloss',
			props: { base: 'SGR', description: 'graphics' }
		})
	})

	test('focus decoration is carried onto the t-gloss element', () => {
		const rendered = render({
			gloss: { base: 'a', description: 'b' },
			decoration: { focus: { class: 'unfocused' } }
		})

		expect(rendered.children[1].props.className).toBe('unfocused')
	})

	test('two adjacent identical glosses with distinct groups render as two containers', () => {
		const editor = new Editor({ types: noteTypeset })
		editor.setRoot(document.createElement('div'))
		const delta = new Delta([
			{ insert: '{a::b}', attributes: { gloss: { base: 'a', description: 'b' }, hiddenGroup: '0-6' } },
			{ insert: '{a::b}', attributes: { gloss: { base: 'a', description: 'b' }, hiddenGroup: '6-12' } }
		])

		const html = inlineToHTML(editor, delta)
		expect((html.match(/inline-gloss-container/g) ?? []).length).toBe(2)
	})

	test('decorations splitting one gloss group do not duplicate its output', () => {
		const editor = new Editor({ types: noteTypeset })
		editor.setRoot(document.createElement('div'))
		const gloss = { base: 'SGR', description: 'Select Graphic Rendition' }
		const delta = new Delta([
			{
				insert: '{SGR',
				attributes: { gloss, hiddenGroup: '0-31', decoration: { focus: { class: 'unfocused' } } }
			},
			{
				insert: '::Select Graphic Rendition}',
				attributes: { gloss, hiddenGroup: '0-31', decoration: { focus: { class: 'focused' } } }
			}
		])

		const html = inlineToHTML(editor, delta)
		expect((html.match(/inline-gloss-container/g) ?? []).length).toBe(1)
		expect((html.match(/<t-gloss/g) ?? []).length).toBe(1)
	})
})
