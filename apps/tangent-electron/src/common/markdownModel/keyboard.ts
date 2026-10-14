import type NoteParser from './NoteParser'
import { getInlineId } from './inline'

export type KeyboardData = {
	children: (string | KeyboardData)[]
}

export type KeyboardScanResult = { end: number, keyboard: KeyboardData | null } | false

const delimiterPairs = new Map([
	['[+', '+]'], ['[-', '-]'], ['⁅', '⁆'], ['⹕', '⹖']
])
const closingDelimiters = new Set(delimiterPairs.values())
const escapedCharacters = new Set(['[', ']', '+', '-', '\\', '⁅', '⁆', '⹕', '⹖'])
const maxDepth = 64

function openingDelimiter(text: string, index: number): string | undefined {
	const candidate = text[index] === '[' ? text.slice(index, index + 2) : text[index]
	return delimiterPairs.has(candidate) ? candidate : undefined
}

export function scanKeyboardSpan(text: string, start = 0): KeyboardScanResult {
	const opener = openingDelimiter(text, start)
	if (!opener) return false

	const root: KeyboardData = { children: [] }
	const stack = [{ opener, node: root }]
	let valid = true

	function appendText(value: string) {
		const children = stack[stack.length - 1].node.children
		const last = children.length - 1
		if (typeof children[last] === 'string') children[last] += value
		else children.push(value)
	}

	for (let index = start + opener.length; index < text.length; index++) {
		const char = text[index]
		if (char === '\n' || char === '\r') return { end: index, keyboard: null }

		if (char === '\\' && escapedCharacters.has(text[index + 1])) {
			appendText(text[++index])
			continue
		}

		const nestedOpener = openingDelimiter(text, index)
		if (nestedOpener) {
			const node: KeyboardData = { children: [] }
			stack[stack.length - 1].node.children.push(node)
			stack.push({ opener: nestedOpener, node })
			index += nestedOpener.length - 1
			if (stack.length > maxDepth) valid = false
			continue
		}

		const closer = char === '+' || char === '-' ? text.slice(index, index + 2) : char
		if (closingDelimiters.has(closer)) {
			const frame = stack.pop()
			if (closer !== delimiterPairs.get(frame.opener) || !frame.node.children.some(child => typeof child !== 'string' || child.trim())) {
				valid = false
			}
			index += closer.length - 1
			if (!stack.length) return { end: index + 1, keyboard: valid ? root : null }
			continue
		}

		appendText(char)
	}

	return { end: text.length, keyboard: null }
}

export function parseInlineKeyboard(char: string, parser: NoteParser): boolean {
	if (char !== '[' && char !== '⁅' && char !== '⹕') return false

	const { feed } = parser
	const result = scanKeyboardSpan(feed.text, feed.index)
	if (!result) return false

	parser.commitSpan(null, 0)
	const start = feed.index
	feed.nextByLength(result.end - start - 1)
	parser.commitSpan(result.keyboard ? {
		keyboard: result.keyboard,
		hiddenGroup: getInlineId(parser, start, result.end)
	} : null)
	return true
}
