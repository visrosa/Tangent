const { exec, spawn } = require("child_process");
const path = require("path")


// TODO: Make this not a copy paste
const mode = process.env.NODE_ENV || 'production';
const prod = mode === 'production';

async function buildDocumentation() {
	const { shortcutPresentation } = await import('../src/common/keyboardKeys.mjs')
	const { buildDocumentation, platformShortcut } = require('./documentation.cjs')
	await buildDocumentation(
		path.resolve(__dirname, '../../../Documentation'),
		path.resolve(__dirname, '../__build'),
		(value, platform) => shortcutPresentation(platformShortcut(value, platform), platform)
			.map(key => '`' + key.label + '`').join(' '))
}

function getViteConfigPath(configName) {
	return path.resolve(path.join(__dirname, `../vite.config.${configName}.mts`))
}

async function buildVite(configName) {
	const { build } = await import('vite')
	return build({
		configFile: getViteConfigPath(configName),
		mode
	})
}

async function watchVite(configName) {
	console.log('Building', configName)
	const { build } = await import('vite')
	const watcher = await build({
		configFile: getViteConfigPath(configName),
		mode,
		build: {
			watch: {},
			// Rewriting the whole directory on every rebuild makes the file
			// watcher downstream fire more than it needs to
			emptyOutDir: false
		}
	})

	// Wait for initial completion.
	// This allows for easy ordering.
	await new Promise((resolve, reject) => {
		const onEvent = event => {
			if (event.code === 'END') {
				watcher.off('event', onEvent)
				resolve()
			}
			else if (event.code === 'ERROR') {
				watcher.off('event', onEvent)
				reject(event.error)
			}
		}
		watcher.on('event', onEvent)
	})

	return watcher
}

const buildMain = () => buildVite('main')
const buildPreload = () => buildVite('preload')
const buildApp = () => buildVite('renderer')

async function buildAll() {
	await buildMain()
	await buildPreload()

	await buildDocumentation()

	await buildApp()
}

/**
 * Starts everything the app needs to run in development.
 *
 * The renderer is served by vite for hot reloading.
 * Main and preload are built normally.
 *
 * @returns The dev server url, and a function that shuts everything down.
 */
async function startDevServer() {
	await buildDocumentation()

	const watchers = [
		await watchVite('main'),
		await watchVite('preload')
	]

	const { createServer } = await import('vite')
	const server = await createServer({
		configFile: getViteConfigPath('renderer'),
		mode
	})
	await server.listen()

	const url = server.resolvedUrls?.local?.[0]
	if (!url) {
		throw new Error('The renderer dev server started without a reachable url')
	}

	console.log(`\nRenderer dev server ready at ${url}\n`)

	return {
		url,
		async close() {
			await Promise.allSettled(watchers.map(w => w.close()))
			await server.close()
		}
	}
}

module.exports = {
	buildDocumentation,

	buildMain,
	buildPreload,
	buildApp,

	buildAll,

	startDevServer
}

if (require.main === module) {
	buildAll()
}
