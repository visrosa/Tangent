const { execFileSync, spawnSync } = require('child_process')
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

function shouldCopy(source, sourceRoot = repoRoot) {
	const rel = path.relative(sourceRoot, source)
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

function copySourceTree(to, sourceRoot = repoRoot) {
	// A local checkout may contain private ignored files and nested worktrees.
	// Git supplies the source inventory, including each initialized submodule.
	const submodules = execFileSync('git', ['submodule', 'status', '--recursive'], {
		cwd: sourceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
	})
	if (submodules.split('\n').some(line => line.startsWith('-') || line.startsWith('U'))) {
		throw new Error('Initialize source submodules and resolve their conflicts before packaging')
	}
	const tracked = execFileSync('git', ['ls-files', '--cached', '--recurse-submodules', '-z'], {
		cwd: sourceRoot,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		maxBuffer: 32 * 1024 * 1024
	}).split('\0').filter(Boolean)
	fs.mkdirSync(to, { recursive: true })
	for (const entry of tracked) {
		const source = path.join(sourceRoot, entry)
		if (!shouldCopy(source, sourceRoot)) continue
		// A missing submodule is listed as a directory; silently copying it would
		// produce an archive that cannot build outside this checkout.
		if (fs.lstatSync(source).isDirectory()) throw new Error(`Uninitialized source submodule: ${entry}`)
		const destination = path.join(to, entry)
		fs.mkdirSync(path.dirname(destination), { recursive: true })
		fs.cpSync(source, destination, { verbatimSymlinks: true })
	}
}

function deriveChannel(version) {
	return version.includes('-') ? 'beta' : 'stable'
}

module.exports = { repoRoot, run, shouldCopy, copySourceTree, deriveChannel }
