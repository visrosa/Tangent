import { shortcutPresentation } from '../src/common/keyboardKeys.mjs'

export function shortcutKeycaps(shortcut, platform) {
	const caps = shortcutPresentation(shortcut, platform).map(key =>
		'⁅' + key.label.replace(/[\\⁅⁆]/g, '\\$&') + '⁆')
	return caps.length > 1 ? '⁅' + caps.join('') + '⁆' : caps[0]
}
