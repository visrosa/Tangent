import { describe, expect, it } from 'vitest'
import FolderInfo from './FolderInfo'
import CardsLensSettings from '../settings/CardsLensSettings'

describe('Folder metadata', () => {
	it.each([undefined, null, {}])('initializes default settings from %s', json => {
		const info = new FolderInfo({ json })
		expect(info.defaultLens.value).toBeNull()
		expect(info.lensSettings.findOrCreateLens({ name: 'Cards', type: CardsLensSettings.staticType })).toBeInstanceOf(CardsLensSettings)
		const restored = new FolderInfo({ json: info.getRawValues('file') })
		expect(restored.lensSettings.length).toBe(info.lensSettings.length)
	})
	it('observes changes after empty initialization and applies external patches', () => {
		const info = new FolderInfo({ json: undefined })
		const patches: unknown[] = []
		info.observePatch(patch => patches.push(patch))
		info.defaultLens.set('Cards')
		expect(patches).toEqual([{ defaultLens: 'Cards' }])
		info.applyPatch({ defaultLens: 'Feed' })
		expect(info.defaultLens.value).toBe('Feed')
		expect(info.applyPatch(undefined)).toBe(false)
	})
})
