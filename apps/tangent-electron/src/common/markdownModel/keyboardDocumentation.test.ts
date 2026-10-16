import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { expect, it } from 'vitest'
import { scanKeyboardSpan } from './keyboard'
import { markdownToTextDocument } from './parser'
import { typewriterToText } from 'common/typewriterUtils'

function* documents(directory: string): Generator<string> {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name)
		if (entry.isDirectory()) yield* documents(filename)
		else if (entry.name.endsWith('.md')) yield filename
	}
}

it('retains documentation source and recognizes prose keycaps', () => {
	let count = 0
	for (const filename of documents(path.resolve('../../Documentation'))) {
		const source = readFileSync(filename, 'utf8')
		expect(typewriterToText(markdownToTextDocument(source)), filename).toBe(source)
		if (filename.endsWith('Keycaps.md')) continue
		for (let index = 0; index < source.length; index++) {
			if (source[index] !== '⁅') continue
			const result = scanKeyboardSpan(source, index)
			expect(result && result.keyboard, `${filename}: ${source.slice(index, index + 80)}`).toBeTruthy()
			if (result) index = result.end - 1
			count++
		}
	}
	expect(count).toBeGreaterThan(0)
})

it('keeps the compatibility fixture partial substitutions literal', () => {
	const source = readFileSync(path.resolve('../../test-files/TestWorkspace/Markdown Compatibility/Keyboard Input.md'), 'utf8')
	const specimens = source.match(/Partially substituted pairs:[\s\S]*?(?=Recovery after)/)?.[0]
	expect(specimens).toBeTruthy()
	const document = markdownToTextDocument(specimens)
	expect(document.lines.flatMap(line => line.content.ops).filter(op => op.attributes?.keyboard)).toHaveLength(0)
	expect(typewriterToText(document)).toBe(specimens)
	const balanced = source.match(/Quill boundaries across ordinary punctuation:.*/)?.[0]
	expect(balanced).toBeTruthy()
	const keycaps = markdownToTextDocument(balanced).lines.flatMap(line => line.content.ops).filter(op => op.attributes?.keyboard)
	expect(keycaps).toHaveLength(1)
	expect(keycaps[0].attributes.keyboard).toEqual({ children: ['N+] [+N'] })
})
