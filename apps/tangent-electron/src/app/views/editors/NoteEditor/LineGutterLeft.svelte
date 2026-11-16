<script lang="ts">
import { isLineCollapsible, lineHasCollapsedChildren } from 'common/markdownModel/sections'
import { tooltip } from 'app/utils/tooltips'
import SvgIcon from 'app/views/smart-icons/SVGIcon.svelte'
import LineGutter from './LineGutter.svelte'
import MarkdownEditor from './MarkdownEditor'

export let editor: MarkdownEditor
export let target: { element: HTMLElement, index: number }
export let column = 0

$: lineName = getLineName(target?.element)
function getLineName(line: HTMLElement) {
	const term = line?.querySelector('.association-list-term-content')?.cloneNode(true) as HTMLElement
	term?.querySelectorAll('.line_format').forEach(format => format.remove())
	return term?.textContent.trim() || 'this section'
}

$: lineCollapseIcon = getLineCollapseIcon(target?.index ?? -1)
function getLineCollapseIcon(index: number) {
	return index >= 0 && editor.collapsingSections.lineHasCollapsedChildren(index) ?
		"collapse.svg#closed" : "collapse.svg#open"
}
$: lineCollapseTooltip = getLineCollapseTooltip(target?.index ?? -1, lineName)
function getLineCollapseTooltip(index: number, name: string) {
	return index >= 0 && editor.collapsingSections.lineHasCollapsedChildren(index) ?
		`Expand ${name}` : `Collapse ${name}`
}

function toggleLineCollapse() {
	const index = target?.index
	if (index !== undefined) {
		editor.collapsingSections.toggleLineCollapsed(index)
		lineCollapseIcon = getLineCollapseIcon(index)
		lineCollapseTooltip = getLineCollapseTooltip(index, lineName)
	}
}

</script>

<LineGutter {editor} {target} {column} side="left" let:doc>
	{#if isLineCollapsible(doc.lines, target.index)}
		<button class="subtle collapse"
			class:shared-group={target.element.classList.contains('association-list-shared-owner')}
			aria-label={`${lineHasCollapsedChildren(doc.lines[target.index]) ? 'Expand' : 'Collapse'} ${lineName}`}
			aria-expanded={!lineHasCollapsedChildren(doc.lines[target.index])}
			on:mousedown|preventDefault
			on:click={toggleLineCollapse}
			use:tooltip={lineCollapseTooltip}
		>
			<SvgIcon size={16} ref={lineCollapseIcon} />
		</button>
	{/if}
</LineGutter>

<style>
button {
	padding: 4px 2px;
	display: flex;
	align-items: center;
}

button.shared-group {
	box-sizing: border-box;
	height: 100%;
	align-items: flex-start;
	padding-block-start: calc((var(--lineGutterLineHeight) - 16px) / 2);
}
</style>
