import { afterEach, expect, it } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import AdmZip from 'adm-zip'
import { buildDocumentation } from '../../build/documentation.cjs'
import { installDocumentation } from './documentationFiles'

const directories: string[] = []
afterEach(async () => {
	await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

it('packages static source unchanged and refreshes it when content changes at the same app version', async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tangent-documentation-'))
	directories.push(root)
	const source = path.join(root, 'source')
	const build = path.join(root, 'build')
	const destination = path.join(root, 'installed')
	const guide = 'Press ⁅⁅Cmd/Ctrl⁆⁅C⁆⁆.\nLiteral text: {{shortcut:Mod+C}}\n`{{shortcut:Mod+V}}`\n'
	await fs.mkdir(path.join(source, '.tangent', 'generated'), { recursive: true })
	await fs.writeFile(path.join(source, '.tangent', 'generated', 'private.json'), '{}')
	await fs.writeFile(path.join(source, 'asset.bin'), Buffer.from([0, 255, 2]))
	await fs.writeFile(path.join(source, 'Guide.md'), guide)
	await buildDocumentation(source, build)
	expect(await fs.readdir(build)).toEqual(['documentation.zip'])
	const archivePath = path.join(build, 'documentation.zip')
	const zip = new AdmZip(archivePath)
	expect(zip.readAsText('Guide.md')).toBe(guide)
	expect(zip.getEntry('.tangent/generated/private.json')).toBeNull()
	expect(zip.getEntry('.documentation-platform.json')).toBeNull()
	expect(zip.readFile('asset.bin')).toEqual(Buffer.from([0, 255, 2]))
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(true)
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(false)
	await buildDocumentation(source, build)
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(false)
	await fs.writeFile(path.join(source, 'Guide.md'), 'Press ⁅⁅Cmd/Ctrl⁆⁅V⁆⁆.')
	await buildDocumentation(source, build)
	expect(await installDocumentation(archivePath, destination, '1.0')).toBe(true)
	expect(await fs.readFile(path.join(destination, 'Guide.md'), 'utf8')).toBe('Press ⁅⁅Cmd/Ctrl⁆⁅V⁆⁆.')
	expect(await installDocumentation(archivePath, destination, '1.0', true)).toBe(true)
})
