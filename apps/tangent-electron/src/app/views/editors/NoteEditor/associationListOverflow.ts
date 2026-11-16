import type { Editor } from 'typewriter-editor'

export function associationListOverflow(editor: Editor) {
	const selector = '.editor-association-list .folded-text-content'
	const observer = new ResizeObserver(update)

	function update() {
		for (const clip of editor.root.querySelectorAll<HTMLElement>(selector)) {
			const source = clip.querySelector<HTMLElement>('.folded-text-source')
			const width = clip.getBoundingClientRect().width
			clip.toggleAttribute('data-overflow', width > 0 && source.getBoundingClientRect().width > width + .5)
		}
	}

	function onRendered() {
		observer.disconnect()
		for (const clip of editor.root.querySelectorAll<HTMLElement>(selector)) {
			observer.observe(clip)
			// Font and preview changes can alter intrinsic width without resizing the clip.
			observer.observe(clip.querySelector('.folded-text-source'))
		}
		update()
	}

	return {
		init() {
			editor.addEventListener('rendered', onRendered)
			onRendered()
		},
		destroy() {
			editor.removeEventListener('rendered', onRendered)
			observer.disconnect()
		}
	}
}
