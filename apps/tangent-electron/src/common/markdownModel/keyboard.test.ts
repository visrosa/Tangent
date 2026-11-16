import { describe, expect, it } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { scanKeyboardSpan } from './keyboard'

function keyboardOps(source: string) {
	return markdownToTextDocument(source).lines.flatMap(line => line.content.ops).filter(op => op.attributes?.keyboard)
}

describe('keyboard syntax', () => {
	it('accepts quill brackets and preserves nested groups', () => {
		expect(scanKeyboardSpan('⁅N⁆')).toEqual({ end: 3, keyboard: { children: ['N'] } })
		expect(scanKeyboardSpan('⁅⁅⎇⁆⁅N⁆⁆')).toEqual({
			end: 8, keyboard: { children: [{ children: ['⎇'] }, { children: ['N'] }] }
		})
	})

	it.each(['[+N+]', '[-N-]', '⹕N⹖', '[+[-N-]+]', '⹕⹕N⹖⹖', '[+N⁆', '[-N⁆', '⹕N⁆'])('leaves former delimiters %j inert', source => {
		expect(scanKeyboardSpan(source)).toBe(false)
		expect(keyboardOps(source)).toHaveLength(0)
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it('treats former delimiters as literal label content', () => {
		const source = '⁅[+N+] [-M-] ⹕X⹖ +] -]⁆'
		expect(scanKeyboardSpan(source)).toEqual({ end: source.length, keyboard: { children: ['[+N+] [-M-] ⹕X⹖ +] -]'] } })
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it.each(['[+⁅N⁆+]', '[-⁅N⁆-]', '⹕⁅N⁆⹖'])('allows real keycaps inside inert punctuation %j', source => {
		expect(keyboardOps(source).map(op => op.insert)).toEqual(['⁅N⁆'])
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it('unescapes only quill brackets and backslashes within labels', () => {
		const source = String.raw`⁅\⁅N\⁆ \\ \[ \+ \- \⹕ \⹖⁆`
		expect(scanKeyboardSpan(source)).toEqual({ end: source.length, keyboard: { children: [String.raw`⁅N⁆ \ \[ \+ \- \⹕ \⹖`] } })
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it('keeps whitespace, Markdown punctuation, Unicode and non-syntax backslashes literal', () => {
		const source = '⁅ **N**  👩‍💻 e\u0301 \\path ⁆'
		expect(scanKeyboardSpan(source)).toMatchObject({ keyboard: { children: [' **N**  👩‍💻 e\u0301 \\path '] } })
	})

	it.each(['⁅⁆', '⁅ ⁆', '⁅N', '⁅⁅N⁆', '⁅⁅⁆⁆', '⁅N\n⁆', '⁅N\r⁆', '⁅N+]', '⁅N-]', '⁅N⹖'])('leaves malformed %j literal', source => {
		expect(keyboardOps(source)).toHaveLength(0)
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it('does not swallow a valid span following a closed malformed span', () => {
		expect(keyboardOps('⁅ ⁆ ⁅M⁆').map(op => op.insert)).toEqual(['⁅M⁆'])
	})

	it.each([64, 65])('accepts at most 64 nested levels: %s', depth => {
		const source = '⁅'.repeat(depth) + 'N' + '⁆'.repeat(depth)
		const result = scanKeyboardSpan(source)
		expect(result && result.keyboard !== null).toBe(depth === 64)
	})

	it('bounds deeply nested source without recursion or loss', () => {
		const source = '⁅'.repeat(1000) + 'N' + '⁆'.repeat(1000)
		expect(scanKeyboardSpan(source)).toEqual({ end: source.length, keyboard: null })
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it.each([
		'`⁅N⁆`', '```\n⁅N⁆\n```', '\\⁅N⁆', '$⁅N⁆$',
		'[[note|⁅N⁆]]', '[label](https://example.org/⁅N⁆)',
		'---\nkeys: "⁅N⁆"\n---',
	])('stays inactive in protected source %j', source => {
		expect(keyboardOps(source)).toHaveLength(0)
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it('retains separate adjacent instances and surrounding formatting', () => {
		const ops = keyboardOps('**⁅N⁆⁅N⁆**')
		expect(ops.map(op => op.attributes.hiddenGroup)).toEqual(['2-5', '5-8'])
		expect(ops.every(op => op.attributes.bold)).toBe(true)
	})

	it('reparses nesting when a closer is edited in a scoped document change', () => {
		const source = 'Before\n⁅⁅N⁆⁆\nAfter'
		const document = markdownToTextDocument(source)
		const offset = source.lastIndexOf('⁆')
		const changed = document.apply(document.change.delete([offset, offset + 1]))
		const parsed = parseMarkdown(changed, { documentStartLine: 1, documentEndLine: 1 })
		expect(parsed.lines.flatMap(line => line.content.ops).some(op => op.attributes?.keyboard)).toBe(false)
	})
})
