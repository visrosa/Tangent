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
		if (filename.endsWith('Keyboard Input.md')) continue
		for (const match of source.matchAll(/⁅[^⁆\n]+⁆/g)) {
			expect(scanKeyboardSpan(match[0])?.keyboard, `${filename}: ${match[0]}`).toBeTruthy()
			count++
		}
	}
	expect(count).toBeGreaterThan(100)
})
