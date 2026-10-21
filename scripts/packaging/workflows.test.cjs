const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const workflows = path.resolve(__dirname, '../../.github/workflows')

function runBlock(workflow, step) {
	const text = fs.readFileSync(path.join(workflows, workflow), 'utf8')
	const section = text.split(`      - name: ${step}\n`)[1]?.split('\n      - name: ')[0]
	assert.ok(section, step)
	return section.split('        run: |\n')[1].split('\n').filter(line => line.startsWith('          ')).map(line => line.slice(10)).join('\n')
		.replaceAll('${{ steps.find-tag.outputs.tag }}', '$REVIEW_TAG')
}

const find = runBlock('upstream-sync.yml', 'Find next upstream tag to merge')
const publish = runBlock('upstream-sync.yml', 'Publish release refs and ensure packaging dispatch')
const upload = runBlock('linux-packaging.yml', 'Publish Linux packages to GitHub Release')

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tangent-release-'))
	t.after(() => fs.rmSync(root, { recursive: true, force: true }))
	const source = path.join(root, 'source')
	const remote = path.join(root, 'remote.git')
	const state = path.join(root, 'state')
	const bin = path.join(root, 'bin')
	for (const directory of [source, state, bin]) fs.mkdirSync(directory)
	const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, REVIEW_STATE: state,
		REVIEW_TAG: 'tangent-v1.0.0', GITHUB_OUTPUT: path.join(root, 'output'),
		GITHUB_REF: 'refs/tags/tangent-dev', GITHUB_REF_NAME: 'tangent-dev',
		GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
		GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
	const exec = (command, args, options = {}) => execFileSync(command, args, {
		cwd: source, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options
	})
	const git = (...args) => exec('git', args).trim()
	git('init', '-q')
	git('branch', '-M', 'linux_packaging')
	fs.mkdirSync(path.join(source, 'apps/tangent-electron'), { recursive: true })
	fs.writeFileSync(path.join(source, 'apps/tangent-electron/package.json'), '{"version":"1.0.0"}')
	git('add', '.')
	git('commit', '-qm', 'upstream')
	git('tag', 'upstream/tangent-v1.0.0')
	git('update-ref', 'refs/remotes/upstream/main', 'HEAD')
	git('commit', '--allow-empty', '-qm', 'packaging')
	const sha = git('rev-parse', 'HEAD')
	env.GITHUB_SHA = sha
	git('init', '--bare', '-q', remote)
	git('remote', 'add', 'origin', remote)
	git('push', '-q', 'origin', 'linux_packaging')
	fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$REVIEW_STATE/calls"
case "$1 $2" in
  'run list')
    if [[ -e "$REVIEW_STATE/list-fails" ]]; then exit 1; fi
    if [[ -e "$REVIEW_STATE/run" ]]; then cat "$REVIEW_STATE/run"; fi ;;
  'workflow run')
    if [[ -e "$REVIEW_STATE/dispatch-fails" ]]; then exit 1; fi
    echo 123 > "$REVIEW_STATE/run" ;;
  'release view') exit 1 ;;
esac
`, { mode: 0o755 })
	const run = script => exec('bash', ['-c', script])
	const output = () => Object.fromEntries(fs.readFileSync(env.GITHUB_OUTPUT, 'utf8').trim().split('\n').map(line => line.split('=')))
	const calls = () => fs.existsSync(path.join(state, 'calls')) ? fs.readFileSync(path.join(state, 'calls'), 'utf8') : ''
	const newer = () => {
		const next = exec('git', ['commit-tree', git('rev-parse', 'HEAD^{tree}'), '-p', git('rev-parse', 'upstream/tangent-v1.0.0'), '-m', 'next upstream']).trim()
		git('tag', 'upstream/tangent-v1.1.0', next)
		git('update-ref', 'refs/remotes/upstream/main', next)
	}
	return { root, source, remote, state, env, sha, git, run, output, calls, newer }
}

test('publication and interrupted dispatch recover before a newer release is merged', t => {
	const f = fixture(t)
	f.newer()
	f.run(find)
	assert.deepEqual(f.output(), { tag: 'tangent-v1.0.0', merge: 'false' })
	fs.writeFileSync(path.join(f.state, 'dispatch-fails'), '')
	assert.throws(() => f.run(publish))
	for (const ref of ['refs/heads/linux_packaging', 'refs/heads/versions/tangent-v1.0.0', 'refs/tags/tangent-v1.0.0']) {
		assert.equal(f.git('ls-remote', 'origin', ref).split('\t')[0], f.sha)
	}
	f.git('fetch', '-q', 'origin', '--tags')
	f.run(find)
	assert.equal(f.output().tag, 'tangent-v1.0.0')
	fs.rmSync(path.join(f.state, 'dispatch-fails'))
	f.run(publish)
	f.run(find)
	assert.deepEqual(f.output(), { tag: 'tangent-v1.1.0', merge: 'true' })
})

test('legacy partial publication uses the existing archive commit and does not repeat dispatch', t => {
	const f = fixture(t)
	f.git('push', '-q', 'origin', 'HEAD:refs/heads/versions/tangent-v1.0.0')
	f.git('commit', '--allow-empty', '-qm', 'later packaging repair')
	f.newer()
	f.run(find)
	assert.equal(f.output().merge, 'false')
	f.run(publish)
	assert.equal(f.git('ls-remote', 'origin', 'refs/tags/tangent-v1.0.0').split('\t')[0], f.sha)
	f.run(publish)
	assert.equal(f.calls().split('\n').filter(line => line.startsWith('workflow run')).length, 1)
})

test('a rejected base push cannot publish a partial tag or archive', t => {
	const f = fixture(t)
	const newer = f.git('commit-tree', f.git('rev-parse', 'HEAD^{tree}'), '-p', f.sha, '-m', 'concurrent base')
	f.git('push', '-q', 'origin', newer + ':refs/heads/linux_packaging')
	assert.throws(() => f.run(publish))
	assert.equal(f.git('ls-remote', 'origin', 'refs/tags/tangent-v1.0.0'), '')
	assert.equal(f.git('ls-remote', 'origin', 'refs/heads/versions/tangent-v1.0.0'), '')
	assert.equal(f.calls(), '')
})

test('GitHub query failures stop reconciliation rather than inventing a missing run', t => {
	const f = fixture(t)
	f.git('tag', 'tangent-v1.0.0')
	f.git('push', '-q', 'origin', 'HEAD:refs/heads/versions/tangent-v1.0.0', 'refs/tags/tangent-v1.0.0')
	fs.writeFileSync(path.join(f.state, 'list-fails'), '')
	assert.throws(() => f.run(find))
	assert.equal(f.calls().includes('workflow run'), false)
})

test('rolling publication skips stale builds and permits the current serialized build', t => {
	const f = fixture(t)
	f.git('push', '-q', 'origin', 'HEAD:refs/tags/tangent-dev')
	f.env.GITHUB_SHA = 'superseded'
	f.run(upload)
	assert.equal(f.calls(), '')
	f.env.GITHUB_SHA = f.sha
	f.run(upload)
	assert.ok(f.calls().includes('release upload tangent-dev'))
	const workflow = fs.readFileSync(path.join(workflows, 'linux-packaging.yml'), 'utf8')
	assert.match(workflow, /concurrency:\n  group: linux-packaging-\$\{\{ github.ref \}\}\n  cancel-in-progress: false/)
})
