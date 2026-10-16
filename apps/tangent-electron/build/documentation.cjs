const fs = require('fs/promises')
const path = require('path')
const AdmZip = require('adm-zip')

const excluded = new Set(['.tangent/generated', '.tangent/Temp', '.tangent/tangents', '.tangent/workspaces'])

async function buildDocumentation(sourceRoot, buildRoot) {
	const files = []
	async function collect(directory, relative = '') {
		for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
			const name = relative ? `${relative}/${entry.name}` : entry.name
			if (excluded.has(name)) continue
			if (entry.isDirectory()) await collect(path.join(directory, entry.name), name)
			else if (entry.isFile()) files.push([name, await fs.readFile(path.join(directory, entry.name))])
		}
	}
	await collect(sourceRoot)
	await fs.mkdir(buildRoot, { recursive: true })
	const zip = new AdmZip()
	for (const [name, data] of files) zip.addFile(name, data)
	// A stable timestamp makes revision checks depend on content, not rebuild time.
	for (const entry of zip.getEntries()) entry.header.time = new Date(2020, 0, 1)
	await fs.writeFile(path.join(buildRoot, 'documentation.zip'), zip.toBuffer())
}

module.exports = { buildDocumentation }
