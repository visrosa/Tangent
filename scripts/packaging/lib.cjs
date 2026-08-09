const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')

function run(command, args, options = {}) {
	console.log(`\n> ${command} ${args.join(' ')}`)
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		stdio: 'inherit',
		shell: process.platform === 'win32',
		...options
	})

	if (result.status !== 0) {
		process.exit(result.status || 1)
	}
}

function shouldCopy(source) {
	const rel = path.relative(repoRoot, source)
	if (!rel) return true
	const parts = rel.split(path.sep)
	if (parts.includes('.tangent')) {
		const tangentIndex = parts.indexOf('.tangent')
		const tangentChild = parts[tangentIndex + 1]
		if (['generated', 'Generated', 'Temp', 'tangents', 'workspaces'].includes(tangentChild)) {
			return false
		}
	}
	return ![
		'.git',
		'.github',
		'node_modules',
		'dist',
		'__build',
		'.svelte-kit'
	].some(excluded => parts.includes(excluded))
}

function copySourceTree(to) {
	fs.cpSync(repoRoot, to, {
		recursive: true,
		verbatimSymlinks: true,
		filter: shouldCopy
	})
}

function deriveChannel(version) {
	return version.includes('-') ? 'beta' : 'stable'
}

module.exports = { repoRoot, run, shouldCopy, copySourceTree, deriveChannel }
