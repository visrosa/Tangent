<script lang="ts">
import { onDestroy, tick } from 'svelte'
import { isLineCollapsible } from 'common/markdownModel/sections'
import { getLineGutterTargets, type LineTarget } from './lineGeometry'
import type MarkdownEditor from './MarkdownEditor'
import LineGutterLeft from './LineGutterLeft.svelte'
import LineGutterRight from './LineGutterRight.svelte'

export let editor: MarkdownEditor
export let container: HTMLElement

let host: HTMLElement
let point: { x: number, y: number } = null
let left: LineTarget[] = []
let right: LineTarget = null
let disposed = false

function refresh() {
	if (!point || !editor.root) return
	const targets = getLineGutterTargets(editor.root, point)
	const collapsible = targets.left.filter(target => isLineCollapsible(editor.doc.lines, target.index))
	left = collapsible[0]?.element.closest('.editor-association-list')
		? collapsible
		: collapsible.slice(0, 1)
	right = targets.right
}

function onMouseMove(event: MouseEvent) {
	// Keep every control reachable while crossing the gutter, including its padded edges.
	if (event.target instanceof Element && event.target.closest('[data-line-gutter="left"]')) {
		right = null
		return
	}
	point = { x: event.clientX, y: event.clientY }
	refresh()
}

function onMouseLeave() {
	point = null
	left = []
	right = null
}

function setHost(next: HTMLElement) {
	if (host === next) return
	host?.removeEventListener('mousemove', onMouseMove)
	host?.removeEventListener('mouseleave', onMouseLeave)
	host = next
	host?.addEventListener('mousemove', onMouseMove)
	host?.addEventListener('mouseleave', onMouseLeave)
}
$: setHost(container)

async function onEditorChanged() {
	await tick()
	if (!disposed) refresh()
}
editor.on('changed', onEditorChanged)
onDestroy(() => {
	disposed = true
	setHost(null)
	editor.off('changed', onEditorChanged)
})
</script>

{#each left as target, index (target.element)}
	<LineGutterLeft {editor} {target} column={left.length - index - 1} />
{/each}
<LineGutterRight {editor} target={right} />
