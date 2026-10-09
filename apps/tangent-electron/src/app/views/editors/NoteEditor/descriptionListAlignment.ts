import type { Editor } from 'typewriter-editor'
import type { Line } from '@typewriter/document'
import type { DlLineData } from 'common/markdownModel/dl'

let nextScope = 0

/** True for empty and whitespace-only lines, including a bare `>` inside a blockquote */
function isBlankLine(line: Line) {
	if (line.attributes.empty || line.attributes.whitespace) return true
	return line.content.ops.every(op => typeof op.insert === 'string'
		&& (op.attributes?.line_format || !op.insert.trim()))
}

/**
 * Description lists separated only by blank lines render as separate grids.
 * This gives each such run one term width per depth by feeding the widest
 * measured term back as the minimum of every block's term track.
 */
export function descriptionListAlignment(editor: Editor) {
	const scope = String(nextScope++)
	const style = document.createElement('style')
	const observer = new ResizeObserver(align)
	// Revealed source would otherwise shift every block in the run while editing,
	// so a revealed term keeps contributing its last unrevealed width.
	let termWidths = new Map<string, number>()

	function getRuns(): string[][] {
		const runs: string[][] = []
		let run: string[] | null = null
		let runKey: string | null = null
		let previousKey: string | null = null

		for (const line of editor.doc.lines) {
			const dl = line.attributes.dl as DlLineData | undefined
			if (!dl) {
				previousKey = null
				if (!isBlankLine(line)) run = null
				continue
			}

			const key = `${line.attributes.blockquote ?? 0}:${dl.rootIndent ?? ''}`
			if (key !== previousKey) {
				if (!run || key !== runKey) {
					run = []
					runs.push(run)
					runKey = key
				}
				run.push(line.id)
			}
			previousKey = key
		}

		return runs.filter(blocks => blocks.length > 1)
	}

	function getBlock(id: string) {
		return editor.root.querySelector(`.editor-description-list[data-dl-block="${CSS.escape(id)}"]`)
	}

	function getTerms(block: Element) {
		return Array.from(block.querySelectorAll(':scope > .dl-term > .dl-term-content')) as HTMLElement[]
	}

	function align() {
		const rules: string[] = []
		const previousWidths = termWidths
		termWidths = new Map()

		for (const run of getRuns()) {
			const blocks = run.map(getBlock).filter(Boolean)
			const widths: number[] = []
			for (const block of blocks) {
				for (const term of getTerms(block)) {
					const line = term.parentElement as HTMLElement & { key?: string }
					const width = line.classList.contains('revealed')
						? previousWidths.get(line.key)
						: term.getBoundingClientRect().width
					if (width === undefined) continue
					termWidths.set(line.key, width)

					const depth = Number(line.dataset.dlDepth)
					widths[depth] = Math.max(widths[depth] ?? 0, width)
				}
			}

			const declarations = Array.from(widths.entries())
				.filter(([_depth, width]) => width !== undefined)
				.map(([depth, width]) => `--dlTermWidth${depth}: ${width}px;`)
				.join(' ')
			if (!declarations) continue

			const selectors = blocks.map(block =>
				`[data-dl-scope="${scope}"] [data-dl-block="${CSS.escape((block as HTMLElement).dataset.dlBlock)}"]`)
			rules.push(`${selectors.join(', ')} { ${declarations} }`)
		}

		const text = rules.join('\n')
		if (style.textContent !== text) style.textContent = text
	}

	function onRendered() {
		observer.disconnect()
		for (const block of editor.root.querySelectorAll('.editor-description-list')) {
			for (const term of getTerms(block)) observer.observe(term)
		}
		align()
	}

	return {
		init() {
			editor.root.dataset.dlScope = scope
			document.head.appendChild(style)
			editor.addEventListener('rendered', onRendered)
		},
		destroy() {
			editor.removeEventListener('rendered', onRendered)
			observer.disconnect()
			style.remove()
			delete editor.root.dataset.dlScope
		}
	}
}
