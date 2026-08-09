#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { repoRoot, run, copySourceTree } = require('./lib.cjs')

const appDir = path.join(repoRoot, 'apps', 'tangent-electron')
const appPackagePath = path.join(appDir, 'package.json')
const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'))

const distRoot = path.join(repoRoot, 'dist', 'gentoo-source')
const sourceRootName = `tangent-${appPackage.version}`
const sourceRoot = path.join(distRoot, sourceRootName)
const sourceTarball = path.join(distRoot, `${sourceRootName}-gentoo-source.tar.gz`)
const vendorTarball = path.join(distRoot, `${sourceRootName}-gentoo-vendor.tar.zst`)

fs.rmSync(distRoot, { recursive: true, force: true })
fs.mkdirSync(distRoot, { recursive: true })
copySourceTree(sourceRoot)
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
