#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { repoRoot, run, deriveChannel } = require('./lib.cjs')

const appDir = path.join(repoRoot, 'apps', 'tangent-electron')
const appPackagePath = path.join(appDir, 'package.json')
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'))

// --target=dir builds an unpacked electron-builder output only — no
// deb/rpm/tarball — for callers that just need a build to seed local caches
// (e.g. CI's tangent-9999 offline-cache step; see linux-packaging.yml).
const targetArg = process.argv.slice(2).find(arg => arg.startsWith('--target='))
const target = targetArg ? targetArg.split('=')[1] : 'deb-rpm'

if (!['deb-rpm', 'dir'].includes(target)) {
	console.error(`Unsupported --target "${target}". Use "deb-rpm" or "dir".`)
	process.exit(1)
}

const requestedChannel = process.env.TANGENT_CHANNEL
const inferredChannel = deriveChannel(appPackage.version)
const channel = requestedChannel || inferredChannel
const packageName = channel === 'beta' ? 'tangent-beta' : 'tangent'
const minimumNodeMajor = 22
const distDir = path.join(appDir, 'dist')
const linuxUnpackedDir = path.join(distDir, 'linux-unpacked')
const linuxTarballName = `${packageName}-${appPackage.version}-linux.tar.gz`

if (!['stable', 'beta'].includes(channel)) {
	console.error(`Unsupported TANGENT_CHANNEL "${channel}". Use "stable" or "beta".`)
	process.exit(1)
}

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < minimumNodeMajor) {
	console.error(`Node ${minimumNodeMajor}+ is required to build Tangent packages. Current Node: ${process.versions.node}`)
	process.exit(1)
}

console.log(`Building Linux packages for ${appPackage.productName || appPackage.name}`)
console.log(`Version: ${appPackage.version}`)
console.log(`Linux package name: ${packageName}`)

run('npm', ['run', 'build', '--workspace', 'packages/tangent-query-parser'])
run('npm', ['run', 'build', '--workspace', 'packages/tangent-html-to-markdown'])
run('npm', ['run', 'build', '--workspace', 'lib/typewriter'])
run('npm', ['run', 'build', '--workspace', 'apps/tangent-electron'])

if (target === 'dir') {
	run('npm', [
		'exec', '--workspace', 'apps/tangent-electron', '--', 'electron-builder',
		'--linux', 'dir', '--x64', '--publish', 'never',
		'-c.linux.executableName=tangent'
	])
	process.exit(0)
}

run('npm', [
	'exec',
	'--workspace',
	'apps/tangent-electron',
	'--',
	'electron-builder',
	'--linux',
	'deb',
	'rpm',
	'--x64',
	'--publish',
	'never',
	'-c.linux.executableName=tangent',
	`-c.deb.packageName=${packageName}`,
	`-c.deb.artifactName=${packageName}-\${version}-\${arch}.\${ext}`,
	`-c.rpm.packageName=${packageName}`,
	`-c.rpm.artifactName=${packageName}-\${version}-\${arch}.\${ext}`
])

if (!fs.existsSync(linuxUnpackedDir)) {
	console.error(`Expected linux-unpacked output at ${linuxUnpackedDir}, but it was not found.`)
	process.exit(1)
}

run('tar', ['-czf', linuxTarballName, 'linux-unpacked'], { cwd: distDir })
