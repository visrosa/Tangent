const definitions = [
	['control', '⌃', 'Control', ['Ctrl', 'Control']],
	['command', '⌘', 'Command', ['Cmd', 'Command']],
	['alt', '⎇', 'Alt', ['Alt', 'Option', '⌥']],
	['shift', '⇧', 'Shift', ['Shift']],
	['meta', '◆', 'Super', ['Meta', 'Super', 'Win', 'Windows', '⊞']],
	['escape', '⎋', 'Escape', ['Escape', 'Esc']],
	['enter', '↵', 'Enter', ['Enter', 'Return', '↩', '⏎']],
	['tab', '⇥', 'Tab', ['Tab', '↹']],
	['backspace', '⌫', 'Backspace', ['Backspace']],
	['delete', '⌦', 'Delete', ['Delete', 'Del']],
	['space', '␣', 'Space', ['Space', 'Spacebar', ' ']],
	['capslock', '⇪', 'Caps Lock', ['CapsLock', 'Caps Lock']],
	['insert', '⎀', 'Insert', ['Insert', 'Ins']],
	['home', '↖', 'Home', ['Home']],
	['end', '↘', 'End', ['End']],
	['pageup', '⇞', 'Page Up', ['PageUp', 'Page Up']],
	['pagedown', '⇟', 'Page Down', ['PageDown', 'Page Down']],
	['left', '←', 'Left Arrow', ['Left', 'ArrowLeft']],
	['right', '→', 'Right Arrow', ['Right', 'ArrowRight']],
	['up', '↑', 'Up Arrow', ['Up', 'ArrowUp']],
	['down', '↓', 'Down Arrow', ['Down', 'ArrowDown']],
	['menu', '☰', 'Menu', ['Menu', 'ContextMenu']],
	['plus', '+', 'Plus', ['Plus']],
	['minus', '-', 'Minus', ['Minus']],
	['equals', '=', 'Equals', ['Equals']],
]
const punctuation = {
	'[': 'Left Square Bracket', ']': 'Right Square Bracket', '{': 'Left Brace', '}': 'Right Brace',
	'(': 'Left Parenthesis', ')': 'Right Parenthesis', '<': 'Less Than', '>': 'Greater Than',
	',': 'Comma', '.': 'Period', '/': 'Slash', '\\': 'Backslash', ';': 'Semicolon', ':': 'Colon',
	"'": 'Apostrophe', '"': 'Quotation Mark', '`': 'Grave Accent', '~': 'Tilde', '!': 'Exclamation Mark',
	'@': 'At Sign', '#': 'Number Sign', '$': 'Dollar Sign', '%': 'Percent', '^': 'Caret',
	'&': 'Ampersand', '*': 'Asterisk', '_': 'Underscore', '|': 'Vertical Bar', '?': 'Question Mark',
}

/** Presentation for application shortcuts, never for arbitrary authored keycaps. */
export function keyPresentation(key, platform) {
	if (key === 'Mod' || key === 'CommandOrControl') key = platform === 'darwin' ? 'Command' : 'Control'
	const definition = definitions.find(([, glyph, , aliases]) => [glyph, ...aliases].some(alias => alias.toLowerCase() === key.toLowerCase()))
	if (definition) {
		let [id, glyph, name] = definition
		if (id === 'alt' && platform === 'darwin') { glyph = '⌥'; name = 'Option' }
		if (id === 'enter' && platform === 'darwin') { glyph = '↩'; name = 'Return' }
		if (id === 'meta') {
			glyph = platform === 'win32' ? '⊞' : platform === 'darwin' ? '⌘' : '◆'
			name = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'Command' : 'Super'
		}
		return { label: glyph, name, tooltip: name }
	}
	const name = punctuation[key] ?? (/^F\d{1,2}$/i.test(key) ? `Function ${key.slice(1)}` : key)
	return { label: key, name, tooltip: /^[\p{L}\p{N}]$/u.test(key) ? undefined : name }
}

export function shortcutPresentation(shortcut, platform) {
	return shortcut.split(/\+(?=.)/).map(key => keyPresentation(key, platform))
}
