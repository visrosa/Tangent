<script lang="ts">
import { onDestroy, onMount } from 'svelte'
import type MarkdownEditor from './MarkdownEditor'
import type NoteViewInfo from 'common/dataTypes/NoteViewInfo'
import { getOutlineHeadings, headingAtPosition, type NoteOutlineControl } from './outline'

export let editor: MarkdownEditor
export let container: HTMLElement
export let info: NoteViewInfo = null
export let extraTop = 0
export let onNavigate: (position: number) => void
export let onWidth: (width: number) => void = () => {}
export let onControl: (control: NoteOutlineControl | null) => void = () => {}

let headings = getOutlineHeadings(editor.doc)
let active: string = null
let preferredExpanded = true
let narrowOpen = false
let narrow = false
let titleBarVisible = false
let availableHeight = 400
let stopPreference: () => void
let frame = 0

$: {
	stopPreference?.()
	stopPreference = info?.outlineExpanded.subscribe(value => preferredExpanded = value)
}
$: expanded = narrow ? narrowOpen : preferredExpanded
$: onWidth(narrow || !expanded ? (titleBarVisible ? 0 : 28) : 192)
$: onControl({ expanded, toggle })

function refresh(event?) {
	headings = getOutlineHeadings(editor.doc)
	if (event?.old?.selection !== event?.doc?.selection && editor.doc.selection) {
		active = headingAtPosition(headings, editor.doc.selection[0])
	}
	else scheduleScroll()
}
function scheduleScroll() {
	if (!frame) frame = requestAnimationFrame(updateFromScroll)
}
function updateFromScroll() {
	frame = 0
	if (!container || !editor.root) return
	const top = container.getBoundingClientRect().top + extraTop + 70
	const lines = editor.root.querySelectorAll<HTMLElement>('.line')
	let current: string = null
	for (const heading of headings) {
		const element = lines[heading.index]
		if (!element || element.getBoundingClientRect().height === 0) continue
		if (element.getBoundingClientRect().top > top) break
		current = heading.id
	}
	active = current
}
function resize() {
	titleBarVisible = container.closest('.ThreadView')?.classList.contains('multiple') ?? false
	const wasNarrow = narrow
	narrow = container.clientWidth < 640
	if (wasNarrow !== narrow) narrowOpen = false
	availableHeight = Math.max(80, Math.min(container.clientHeight, window.innerHeight) - extraTop - 16)
	scheduleScroll()
}
function toggle() {
	if (narrow) narrowOpen = !narrowOpen
	else {
		preferredExpanded = !preferredExpanded
		info?.outlineExpanded.set(preferredExpanded)
	}
}
function navigate(start: number) {
	onNavigate(start)
	if (narrow) narrowOpen = false
}
function onKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		narrowOpen = false
		editor.root.focus({ preventScroll: true })
	}
}

onMount(() => {
	editor.on('changed', refresh)
	container.addEventListener('scroll', scheduleScroll, { passive: true })
	window.addEventListener('resize', resize)
	const observer = new ResizeObserver(resize)
	observer.observe(container)
	const thread = container.closest('.ThreadView')
	const titleObserver = new MutationObserver(resize)
	if (thread) titleObserver.observe(thread, { attributes: true, attributeFilter: ['class'] })
	resize()
	return () => {
		editor.off('changed', refresh)
		container.removeEventListener('scroll', scheduleScroll)
		window.removeEventListener('resize', resize)
		observer.disconnect()
		titleObserver.disconnect()
	}
})
onDestroy(() => {
	stopPreference?.()
	cancelAnimationFrame(frame)
	onControl(null)
})
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="outline-anchor" style:top={`${extraTop}px`} on:mousedown|stopPropagation on:mouseup|stopPropagation on:keydown|stopPropagation={onKeyDown}>
	<nav aria-label="Note outline" class:expanded class:inTitleBar={titleBarVisible} class:overlay={narrow && expanded} style:height={`${availableHeight}px`}>
		{#if !titleBarVisible}
		<button class="toggle" type="button" aria-label={expanded ? 'Collapse outline' : 'Expand outline'} aria-expanded={expanded} on:click={toggle} title={expanded ? 'Collapse outline' : 'Expand outline'}>
			{expanded ? '‹' : '☷'}
			{#if expanded}<span>Outline</span>{/if}
		</button>
		{:else if expanded}<span class="outline-title">Outline</span>{/if}
		{#if expanded}
			<div class="headings">
				{#each headings as heading (heading.id)}
					<button type="button" class:active={active === heading.id} aria-current={active === heading.id ? 'location' : undefined} style:padding-left={`${8 + heading.depth * 12}px`} on:click={() => navigate(heading.start)} title={heading.text}>{heading.text}</button>
				{:else}
					<p>No headings</p>
				{/each}
			</div>
		{/if}
	</nav>
</div>

<style>
.outline-anchor { position: sticky; height: 0; margin-left: calc(-1 * var(--outlineWidth)); z-index: 11; }
nav { width: 28px; display: flex; flex-direction: column; background: var(--noteBackgroundColor); border-right: 1px solid var(--borderColor); box-sizing: border-box; cursor: default; }
nav.expanded { width: 192px; }
nav.inTitleBar:not(.expanded) { display: none; }
.outline-title { padding: 8px; font-size: 12px; color: var(--deemphasizedTextColor); }
nav.overlay { box-shadow: 4px 0 12px #0003; }
button { color: var(--deemphasizedTextColor); background: none; border: none; text-align: left; cursor: pointer; font: inherit; font-size: 12px; }
button:hover, button.active { color: var(--textColor); background: var(--accentBackgroundColor); }
button:focus-visible { outline: 2px solid var(--accentColor); outline-offset: -2px; }
.toggle { flex: 0 0 32px; display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
.headings { overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding: 4px 0; }
.headings button { display: block; width: 100%; overflow-wrap: anywhere; line-height: 1.4; padding: 5px 8px; }
p { color: var(--deemphasizedTextColor); font-size: 12px; padding: 8px; }
</style>
