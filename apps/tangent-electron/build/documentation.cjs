const fs = require('fs/promises')
const path = require('path')
const AdmZip = require('adm-zip')

const platforms = ['darwin', 'win32', 'linux']
const excluded = new Set(['.tangent/generated', '.tangent/Temp', '.tangent/tangents', '.tangent/workspaces'])

function platformShortcut(value, platform) {
	if (!platforms.includes(platform)) throw new Error(`Unsupported documentation platform: ${platform}`)
	if (/^(darwin|win32|linux|other)=/.test(value)) {
		const choices = Object.fromEntries(value.split(';').map(choice => {
			const index = choice.indexOf('=')
			return [choice.slice(0, index).trim(), choice.slice(index + 1).trim()]
		}))
		value = choices[platform] ?? choices.other
		if (!value) throw new Error(`Missing ${platform} shortcut alternative`)
	}
	return value.replace(/\bMod\b/g, platform === 'darwin' ? 'Cmd' : 'Ctrl')
}

function shortcutMarkdown(value, platform) {
	return '`' + platformShortcut(value, platform) + '`'
}

function specializeDocumentation(source, platform, render = shortcutMarkdown) {
	// Markers are editorial build directives, including within keycap markup.
	// Code fences and inline code remain literal documentation specimens.
	return source.replace(/(^[ \t]*(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*(?:`{3,}|~{3,})[^\n]*(?:\n|$))|(`+)[^`]*?\2|\{\{shortcut:([^{}\n]+)\}\}/gm,
		(match, fence, code, shortcut) => shortcut ? render(shortcut.trim(), platform) : match)
}

async function buildDocumentation(sourceRoot, buildRoot, render = shortcutMarkdown) {
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
	for (const platform of platforms) {
		const zip = new AdmZip()
		zip.addFile('.documentation-platform.json', Buffer.from(JSON.stringify({ platform })))
		for (const [name, data] of files) {
			zip.addFile(name, name.endsWith('.md') ? Buffer.from(specializeDocumentation(data.toString('utf8'), platform, render)) : data)
		}
		// A stable timestamp makes revision checks depend on content, not rebuild time.
		for (const entry of zip.getEntries()) entry.header.time = new Date(2020, 0, 1)
		await fs.writeFile(path.join(buildRoot, `documentation-${platform}.zip`), zip.toBuffer())
	}
}

module.exports = { platforms, platformShortcut, shortcutMarkdown, specializeDocumentation, buildDocumentation }
