import { afterEach, expect, it } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { buildDocumentation, specializeDocumentation } from '../../build/documentation.cjs'
import { installDocumentation } from './documentationFiles'

const directories: string[] = []
afterEach(async () => {
	await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

it.each(['darwin', 'win32', 'linux'])('specializes explicit shortcuts for %s without rewriting literal specimens', platform => {
	const literal = '`{{shortcut:Mod+C}}`\n```md\n{{shortcut:Mod+C}}\n```\n'
	const output = specializeDocumentation(literal + '{{shortcut:Mod+C}}, {{shortcut:Mod+=}}, {{shortcut:darwin=Ctrl+Alt+Up;other=Alt+Shift+Up}}', platform)
	expect(output.startsWith(literal)).toBe(true)
	expect(output).toContain(platform === 'darwin' ? '`Cmd+C`' : '`Ctrl+C`')
	expect(output).toContain(platform === 'darwin' ? '`Cmd+=`' : '`Ctrl+=`')
	expect(output).toContain(platform === 'darwin' ? '`Ctrl+Alt+Up`' : '`Alt+Shift+Up`')
	expect(() => specializeDocumentation('{{shortcut:darwin=Cmd+C}}', 'linux')).toThrow('Missing linux')
})

it('builds all target archives and refreshes extracted documentation on content changes at the same app version', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tangent-documentation-'))
	directories.push(root)
	const source = path.join(root, 'source')
	const build = path.join(root, 'build')
	const destination = path.join(root, 'installed')
	await fs.mkdir(path.join(source, '.tangent', 'generated'), { recursive: true })
	await fs.writeFile(path.join(source, '.tangent', 'generated', 'private.json'), '{}')
	await fs.writeFile(path.join(source, 'asset.bin'), Buffer.from([0, 255, 2]))
	await fs.writeFile(path.join(source, 'Guide.md'), 'Press {{shortcut:Mod+C}}.')
	await buildDocumentation(source, build)
	for (const platform of ['darwin', 'win32', 'linux']) {
		const archivePath = path.join(build, `documentation-${platform}.zip`)
		const zip = new AdmZip(archivePath)
		expect(zip.readAsText('Guide.md')).toBe(platform === 'darwin' ? 'Press `Cmd+C`.' : 'Press `Ctrl+C`.')
		expect(zip.getEntry('.tangent/generated/private.json')).toBeNull()
		expect(zip.readFile('asset.bin')).toEqual(Buffer.from([0, 255, 2]))
		expect(await installDocumentation(archivePath, destination, '1.0')).toBe(true)
	}
	const archivePath = path.join(build, 'documentation-linux.zip')
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(false)
	await buildDocumentation(source, build)
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(false)
	await fs.writeFile(path.join(source, 'Guide.md'), 'Press {{shortcut:Mod+V}}.')
	await buildDocumentation(source, build)
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(true)
	expect(await fs.readFile(path.join(destination, 'Guide.md'), 'utf8')).toBe('Press `Ctrl+V`.')
	expect(await installDocumentation(archivePath, destination, '1.0', true)).toBe(true)
})

it('preserves nested fence examples, multiline code spans and escaped directives', () => {
	const literal = '````md\n```\n{{shortcut:Mod+C}}\n```\n````\n`literal\n{{shortcut:Mod+C}}`\n\\{{shortcut:Mod+C}}\n'
	expect(specializeDocumentation(literal + '{{shortcut:Mod+V}}', 'linux')).toBe(literal + '`Ctrl+V`')
})
