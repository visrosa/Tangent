import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import { expect, it } from 'vitest'
import { scanKeyboardSpan } from './keyboard'
import { specializeDocumentation, platformShortcut } from '../../../build/documentation.cjs'
import { shortcutKeycaps } from '../../../build/documentation-keycaps.mjs'
import { markdownToTextDocument } from './parser'
import { typewriterToText } from 'common/typewriterUtils'

function* documents(directory: string): Generator<string> {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name)
		if (entry.isDirectory()) yield* documents(filename)
		else if (entry.name.endsWith('.md')) yield filename
	}
}

it.each(['darwin', 'win32', 'linux'])('renders generated %s documentation shortcuts while preserving authored keycaps', platform => {
	let count = 0
	for (const filename of documents(path.resolve('../../Documentation'))) {
		const source = readFileSync(filename, 'utf8')
		const rendered = specializeDocumentation(source, platform, (value, platform) => shortcutKeycaps(platformShortcut(value, platform), platform))
		expect(typewriterToText(markdownToTextDocument(rendered)), filename).toBe(rendered)
		count += (rendered.match(/⁅/g) ?? []).length
	}
	expect(count).toBeGreaterThan(100)
	expect(shortcutKeycaps('Mod+C', platform)).toBe(platform === 'darwin' ? '⁅⁅⌘⁆⁅C⁆⁆' : '⁅⁅⌃⁆⁅C⁆⁆')
	const plus = scanKeyboardSpan(shortcutKeycaps('Mod++', platform))
	expect(plus && plus.keyboard.children).toHaveLength(2)
	const backslash = scanKeyboardSpan(shortcutKeycaps('Mod+\\', platform))
	expect(backslash && backslash.keyboard.children[1]).toEqual({ children: ['\\'] })
	const authored = '⁅Control⁆ and ⁅a literal arbitrary label⁆'
	expect(specializeDocumentation(authored, platform)).toBe(authored)
})
