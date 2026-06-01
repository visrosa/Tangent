#!/usr/bin/env node

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const appDir = path.join(repoRoot, 'apps', 'tangent-electron')
const appPackagePath = path.join(appDir, 'package.json')
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'))

const distRoot = path.join(repoRoot, 'dist', 'gentoo-source')
const sourceRootName = `tangent-${appPackage.version}`
const sourceRoot = path.join(distRoot, sourceRootName)
const sourceTarball = path.join(distRoot, `${sourceRootName}-gentoo-source.tar.gz`)
const vendorTarball = path.join(distRoot, `${sourceRootName}-gentoo-vendor.tar.zst`)

function run(command, args, options = {}) {
	console.log(`\n> ${command} ${args.join(' ')}`)
	const result = spawnSync(command, args, {
		cwd: options.cwd || repoRoot,
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

function copyTree(from, to) {
	if (!shouldCopy(from)) return

	const stats = fs.lstatSync(from)
	if (stats.isSymbolicLink()) {
		fs.symlinkSync(fs.readlinkSync(from), to)
		return
	}

	if (stats.isDirectory()) {
		fs.mkdirSync(to, { recursive: true })
		for (const entry of fs.readdirSync(from)) {
			copyTree(path.join(from, entry), path.join(to, entry))
		}
		return
	}

	fs.copyFileSync(from, to)
}

fs.rmSync(distRoot, { recursive: true, force: true })
fs.mkdirSync(distRoot, { recursive: true })
copyTree(repoRoot, sourceRoot)
run('tar', ['-czf', sourceTarball, '-C', distRoot, sourceRootName])

const npmCache = process.env.npm_config_cache || path.join(process.env.HOME || '', '.npm')
if (!fs.existsSync(npmCache)) {
	console.error(`npm cache was not found at ${npmCache}`)
	process.exit(1)
}

const vendorRoot = path.join(sourceRoot, 'vendor')
const vendorCacheDest = path.join(vendorRoot, 'npm-cache')
console.log(`Vendoring npm cache from ${npmCache}`)
fs.mkdirSync(vendorRoot, { recursive: true })
fs.cpSync(npmCache, vendorCacheDest, { recursive: true })

const electronCache = path.join(process.env.HOME || '', '.cache', 'electron')
if (fs.existsSync(electronCache)) {
	console.log(`Vendoring Electron cache from ${electronCache}`)
	fs.cpSync(electronCache, path.join(vendorRoot, 'electron-cache'), { recursive: true })
}

const electronBuilderCache = path.join(process.env.HOME || '', '.cache', 'electron-builder')
if (fs.existsSync(electronBuilderCache)) {
	console.log(`Vendoring electron-builder cache from ${electronBuilderCache}`)
	fs.cpSync(electronBuilderCache, path.join(vendorRoot, 'electron-builder-cache'), { recursive: true })
}

run('tar', ['--zstd', '-cf', vendorTarball, '-C', sourceRoot, 'vendor'])

console.log('\nGentoo source assets:')
console.log(sourceTarball)
console.log(vendorTarball)
