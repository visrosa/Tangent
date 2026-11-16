import fs from 'fs/promises'
import path from 'path'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'

export async function installDocumentation(archivePath: string, destination: string, version: string, force = false) {
	const archive = await fs.readFile(archivePath)
	const revision = version + ':' + createHash('sha256').update(archive).digest('hex')
	const versionPath = path.join(destination, 'version.txt')
	const previous = await fs.readFile(versionPath, 'utf8').catch(() => '')
	if (!force && previous === revision) return false
	const zip = new AdmZip(archive)
	await fs.rm(destination, { recursive: true, force: true })
	zip.extractAllTo(destination)
	await fs.writeFile(versionPath, revision)
	return true
}
