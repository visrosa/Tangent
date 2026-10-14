import { describe, expect, it } from 'vitest'
import { typewriterToText } from 'common/typewriterUtils'
import { markdownToTextDocument, parseMarkdown } from './parser'
import { scanKeyboardSpan } from './keyboard'

describe('keyboard syntax', () => {
	it.each(['[+N+]', '[-N-]', '⁅N⁆', '⹕N⹖'])('accepts interchangeable spelling %s', source => {
		expect(scanKeyboardSpan(source)).toEqual({ end: source.length, keyboard: { children: ['N'] } })
	})

	it.each([
		'[+[+⎇+][+N+]+]', '[-[-⎇-][-N-]-]', '[+[-⎇-][+N+]+]',
		'⁅⹕⎇⹖⹕N⹖⁆', '⹕⁅⎇⁆[-N-]⹖', '[+⹕⎇⹖⁅N⁆+]',
	])('preserves nested structure in %s', source => {
		expect(scanKeyboardSpan(source)).toEqual({
			end: source.length,
			keyboard: { children: [{ children: ['⎇'] }, { children: ['N'] }] }
		})
	})

	it('requires a matched pair for every source spelling', () => {
		const pairs = [['[+', '+]'], ['[-', '-]'], ['⁅', '⁆'], ['⹕', '⹖']]
		for (const [openIndex, [opener]] of pairs.entries()) {
			for (const [closeIndex, [, closer]] of pairs.entries()) {
				const source = opener + 'N' + closer
				const result = scanKeyboardSpan(source)
				expect(result).toEqual({ end: source.length, keyboard: openIndex === closeIndex ? { children: ['N'] } : null })
				expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
			}
		}
	})

	it('unescapes glyph delimiters inside a label while retaining source bytes', () => {
		const source = String.raw`⁅\⹕N\⹖ \⁅M\⁆⁆`
		expect(scanKeyboardSpan(source)).toEqual({ end: source.length, keyboard: { children: ['⹕N⹖ ⁅M⁆'] } })
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it.each(['⁅⁆', '⹕ ⹖', '⁅N', '⹕N\n⹖', '⁅⹕N⁆⁆', '⁅⹕⹖⁆'])('leaves malformed glyph source %j literal', source => {
		const document = markdownToTextDocument(source)
		expect(typewriterToText(document)).toBe(source)
		expect(document.lines.flatMap(line => line.content.ops).some(op => op.attributes?.keyboard)).toBe(false)
	})

	it.each(['⁅N⁆', '⹕N⹖'])('stays inactive in protected contexts for %s', span => {
		for (const source of [
			'`' + span + '`', '```\n' + span + '\n```', '\\' + span, '$' + span + '$',
			'[[note|' + span + ']]', '[label](https://example.org/' + span + ')',
			'---\nkeys: "' + span + '"\n---',
		]) {
			const document = markdownToTextDocument(source)
			expect(typewriterToText(document)).toBe(source)
			expect(document.lines.flatMap(line => line.content.ops).some(op => op.attributes?.keyboard)).toBe(false)
		}
	})

	it('keeps whitespace, Markdown punctuation, Unicode and non-syntax backslashes literal', () => {
		const source = '[+ **N**  👩‍💻 e\u0301 \\path +]'
		expect(scanKeyboardSpan(source)).toMatchObject({ keyboard: { children: [' **N**  👩‍💻 e\u0301 \\path '] } })
	})

	it('unescapes delimiter punctuation and backslashes without changing source', () => {
		const source = String.raw`[+\[+N\+\] \\ +]`
		expect(scanKeyboardSpan(source)).toMatchObject({ keyboard: { children: ['[+N+] \\ '] } })
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it.each(['[++]', '[- -]', '[+N-]', '[+[-N+]+]', '[+N', '[+[+N+]', '[+N\n+]', '[+N\r+]'])('leaves malformed %j literal', source => {
		const document = markdownToTextDocument(source)
		expect(typewriterToText(document)).toBe(source)
		expect(document.lines.flatMap(line => line.content.ops).some(op => op.attributes?.keyboard)).toBe(false)
	})

	it('does not swallow a valid span following a malformed closed span', () => {
		const line = parseMarkdown('[+N-] [+M+]').lines[0]
		expect(line.content.ops.filter(op => op.attributes?.keyboard).map(op => op.insert)).toEqual(['[+M+]'])
	})

	it('bounds deeply nested source without recursion or loss', () => {
		const source = '[+'.repeat(1000) + 'N' + '+]'.repeat(1000)
		expect(scanKeyboardSpan(source)).toEqual({ end: source.length, keyboard: null })
		expect(typewriterToText(markdownToTextDocument(source))).toBe(source)
	})

	it.each([
		'`[+N+]`', '```\n[-N-]\n```', '\\[+N+]', '$[+N+]$',
		'[[note|[+N+]]]', '[label](https://example.org/[+N+])',
		'---\nkeys: "[+N+]"\n---',
	])('stays inactive in protected source %j', source => {
		const document = markdownToTextDocument(source)
		expect(typewriterToText(document)).toBe(source)
		expect(document.lines.flatMap(line => line.content.ops).some(op => op.attributes?.keyboard)).toBe(false)
	})

	it('retains separate adjacent instances and surrounding formatting', () => {
		const line = parseMarkdown('**[+N+][+N+]**').lines[0]
		const ops = line.content.ops.filter(op => op.attributes?.keyboard)
		expect(ops.map(op => op.attributes.hiddenGroup)).toEqual(['2-7', '7-12'])
		expect(ops.every(op => op.attributes.bold)).toBe(true)
	})

	it('reparses nesting when a closer is edited in a scoped document change', () => {
		const source = 'Before\n[+[-N-]+]\nAfter'
		const document = markdownToTextDocument(source)
		const offset = source.indexOf('+]')
		const changed = document.apply(document.change.delete([offset, offset + 1]))
		const parsed = parseMarkdown(changed, { documentStartLine: 1, documentEndLine: 1 })
		expect(parsed.lines.flatMap(line => line.content.ops).some(op => op.attributes?.keyboard)).toBe(false)
	})
})
