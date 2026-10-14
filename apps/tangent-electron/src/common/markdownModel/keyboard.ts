import type NoteParser from './NoteParser'
import { getInlineId } from './inline'

export type KeyboardData = {
	children: (string | KeyboardData)[]
}

export type KeyboardScanResult = { end: number, keyboard: KeyboardData | null } | false

const escapedCharacters = new Set(['[', ']', '+', '-', '\\'])
const maxDepth = 64

export function scanKeyboardSpan(text: string, start = 0): KeyboardScanResult {
	if (text[start] !== '[' || !isSign(text[start + 1])) return false

	const root: KeyboardData = { children: [] }
	const stack = [{ sign: text[start + 1], node: root }]
	let valid = true

	function appendText(value: string) {
		const children = stack[stack.length - 1].node.children
		const last = children.length - 1
		if (typeof children[last] === 'string') children[last] += value
		else children.push(value)
	}

	for (let index = start + 2; index < text.length; index++) {
		const char = text[index]
		if (char === '\n' || char === '\r') return { end: index, keyboard: null }

		if (char === '\\' && escapedCharacters.has(text[index + 1])) {
			appendText(text[++index])
			continue
		}

		if (char === '[' && isSign(text[index + 1])) {
			const node: KeyboardData = { children: [] }
			stack[stack.length - 1].node.children.push(node)
			stack.push({ sign: text[++index], node })
			if (stack.length > maxDepth) valid = false
			continue
		}

		if (isSign(char) && text[index + 1] === ']') {
			const frame = stack.pop()
			if (char !== frame.sign || !frame.node.children.some(child => typeof child !== 'string' || child.trim())) {
				valid = false
			}
			index++
			if (!stack.length) return { end: index + 1, keyboard: valid ? root : null }
			continue
		}

		appendText(char)
	}

	return { end: text.length, keyboard: null }
}

function isSign(char: string) {
	return char === '+' || char === '-'
}

export function parseInlineKeyboard(char: string, parser: NoteParser): boolean {
	if (char !== '[') return false

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
