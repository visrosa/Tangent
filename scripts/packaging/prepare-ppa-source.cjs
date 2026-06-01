#!/usr/bin/env node

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const appDir = path.join(repoRoot, 'apps', 'tangent-electron')
const appPackage = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))

const args = new Set(process.argv.slice(2))
const vendorNpmCache = args.has('--vendor-npm-cache')
const vendorNode = args.has('--vendor-node')
const series = process.env.UBUNTU_SERIES || 'noble'
const defaultMaintainerName = 'visrosa (https://github.com/visrosa/Tangent)'
const maintainer = process.env.DEBEMAIL
	? `${process.env.DEBFULLNAME || defaultMaintainerName} <${process.env.DEBEMAIL}>`
	: `${defaultMaintainerName} <maintainers@example.invalid>`

const channel = appPackage.version.includes('-') ? 'beta' : 'stable'
const sourcePackage = channel === 'beta' ? 'tangent-beta' : 'tangent'
const debianPackage = sourcePackage
const upstreamVersion = toDebianUpstreamVersion(appPackage.version)
const debianVersion = `${upstreamVersion}-0ubuntu1~${series}1`
const outputRoot = path.join(repoRoot, 'dist', 'ppa-source', series)
const sourceDir = path.join(outputRoot, `${sourcePackage}-${upstreamVersion}`)
const origTarball = path.join(outputRoot, `${sourcePackage}_${upstreamVersion}.orig.tar.gz`)

function toDebianUpstreamVersion(version) {
	const [base, prerelease] = version.split('-', 2)
	return prerelease ? `${base}~${prerelease}` : base
}

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

function hasCommand(command) {
	const result = spawnSync('sh', ['-c', `command -v ${command}`], {
		cwd: repoRoot,
		stdio: 'ignore',
		shell: process.platform === 'win32'
	})
	return result.status === 0
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

function writeFile(filePath, contents, mode) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, contents)
	if (mode) fs.chmodSync(filePath, mode)
}

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(outputRoot, { recursive: true })
copyTree(repoRoot, sourceDir)

const debianDir = path.join(sourceDir, 'debian')
fs.mkdirSync(debianDir, { recursive: true })

writeFile(path.join(debianDir, 'control'), `Source: ${sourcePackage}
Section: editors
Priority: optional
Maintainer: ${maintainer}
Build-Depends: debhelper-compat (= 13), nodejs, npm
Standards-Version: 4.7.0
Rules-Requires-Root: no
Homepage: https://github.com/visrosa/Tangent

Package: ${debianPackage}
Architecture: amd64
Depends: \${shlibs:Depends}, \${misc:Depends}
${debianPackage === 'tangent-beta' ? 'Conflicts: tangent\nReplaces: tangent\n' : 'Conflicts: tangent-beta\nReplaces: tangent-beta\n'}Description: Tangent note-writing app${debianPackage === 'tangent-beta' ? ' (beta channel)' : ''}
 Tangent is a note-writing and thought-mapping desktop application.
`)

writeFile(path.join(debianDir, 'changelog'), `${sourcePackage} (${debianVersion}) ${series}; urgency=medium

  * Automated ${channel} source package build.

 -- ${maintainer}  ${new Date().toUTCString().replace('GMT', '+0000')}
`)

let rules = `#!/usr/bin/make -f

export TANGENT_CHANNEL=${channel}
export npm_config_audit=false
export npm_config_fund=false

%:
\tdh $@

override_dh_auto_build:
\tnpm ci --workspaces --include-workspace-root --offline
\tnpm run build --workspace packages/tangent-query-parser
\tnpm run build --workspace packages/tangent-html-to-markdown
\tnpm run build --workspace lib/typewriter
\tnpm run build --workspace apps/tangent-electron
\tnpm exec --workspace apps/tangent-electron -- electron-builder --linux deb --x64 --publish never -c.linux.executableName=tangent -c.deb.packageName=${debianPackage} -c.deb.artifactName=${debianPackage}-\${version}-\${arch}.\${ext}

override_dh_auto_install:
\tmkdir -p debian/${debianPackage}
\tdpkg-deb -x apps/tangent-electron/dist/${debianPackage}-*.deb debian/${debianPackage}

override_dh_auto_test:
`

if (vendorNpmCache) {
	rules = rules.replace(
		`export npm_config_audit=false`,
		`export npm_config_cache=$(CURDIR)/vendor/npm-cache\nexport npm_config_offline=true\nexport npm_config_audit=false`
	)
}

if (vendorNode) {
	rules = rules.replace(
		`export npm_config_fund=false`,
		`export npm_config_fund=false\nexport PATH := $(CURDIR)/vendor/node/bin:$(PATH)`
	)
}

writeFile(path.join(debianDir, 'rules'), rules, 0o755)

writeFile(path.join(debianDir, 'source', 'format'), '3.0 (quilt)\n')
writeFile(path.join(debianDir, 'source', 'options'), 'extend-diff-ignore = "(^|/)package-lock\\.json$"\n')
writeFile(path.join(debianDir, 'copyright'), `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: Tangent
Source: https://github.com/visrosa/Tangent

Files: *
Copyright: 2022 Taylor Hadden
License: Apache-2.0
`)

if (vendorNpmCache) {
	const npmCache = process.env.npm_config_cache || path.join(process.env.HOME || '', '.npm')
	const cacheDest = path.join(sourceDir, 'vendor', 'npm-cache')
	console.log(`Vendoring npm cache from ${npmCache}`)
	fs.cpSync(npmCache, cacheDest, { recursive: true })
}

if (vendorNode) {
	const binDir = path.dirname(process.execPath)
	const nodeHome = path.dirname(binDir)
	if (!fs.existsSync(path.join(nodeHome, 'bin', 'node'))) {
		throw new Error(`Could not find Node home from ${process.execPath}`)
	}
	const nodeDest = path.join(sourceDir, 'vendor', 'node')
	console.log(`Vendoring Node runtime from ${nodeHome}`)
	fs.cpSync(nodeHome, nodeDest, { recursive: true })
}

run('tar', ['--exclude=debian', '-czf', origTarball, '-C', outputRoot, `${sourcePackage}-${upstreamVersion}`])
if (hasCommand('dh')) {
	run('dpkg-buildpackage', ['-S', '-d', '-us', '-uc'], { cwd: sourceDir })
}
else {
	console.warn('\nDebhelper is not installed; creating .dsc with dpkg-source only.')
	console.warn('Install debhelper to produce signed/unsigned .changes files locally.')
	run('dpkg-source', ['-b', '.'], { cwd: sourceDir })
}

console.log(`\nSource package output: ${outputRoot}`)
