#!/usr/bin/env node

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const appDir = path.join(repoRoot, 'apps', 'tangent-electron')
const appPackagePath = path.join(appDir, 'package.json')
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'))

const requestedChannel = process.env.TANGENT_DEB_CHANNEL
const inferredChannel = appPackage.version.includes('-') ? 'beta' : 'stable'
const channel = requestedChannel || inferredChannel
const packageName = channel === 'beta' ? 'tangent-beta' : 'tangent'
const minimumNodeMajor = 22

if (!['stable', 'beta'].includes(channel)) {
	console.error(`Unsupported TANGENT_DEB_CHANNEL "${channel}". Use "stable" or "beta".`)
	process.exit(1)
}

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < minimumNodeMajor) {
	console.error(`Node ${minimumNodeMajor}+ is required to build Tangent packages. Current Node: ${process.versions.node}`)
	process.exit(1)
}

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

console.log(`Building Debian package for ${appPackage.productName || appPackage.name}`)
console.log(`Version: ${appPackage.version}`)
console.log(`Debian package name: ${packageName}`)

run('npm', ['run', 'build', '--workspace', 'packages/tangent-query-parser'])
run('npm', ['run', 'build', '--workspace', 'packages/tangent-html-to-markdown'])
run('npm', ['run', 'build', '--workspace', 'lib/typewriter'])
run('npm', ['run', 'build', '--workspace', 'apps/tangent-electron'])
run('npm', [
	'exec',
	'--workspace',
	'apps/tangent-electron',
	'--',
	'electron-builder',
	'--linux',
	'deb',
	'--x64',
	'--publish',
	'never',
	'-c.linux.executableName=tangent',
	`-c.deb.packageName=${packageName}`,
	`-c.deb.artifactName=${packageName}-\${version}-\${arch}.\${ext}`
])
