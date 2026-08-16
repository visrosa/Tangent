// TODO: Remove
export const horizontalRuleText = /^((- *){3,}|(\* *){3,}|(_ *){3,})$/

// TODO: provide a contextual wrapper of what this parses

export const indentMatcher = /^\s*/

// '' counts as whitespace so a peek() past a text boundary reads as touching whitespace.
export function isStrictWhitespace(char: string) {
	switch(char) {
		case '':
			return true
		case '\n':
			return true
		case ' ':
			return true
		case '\t':
			return true
	}
}

export function isAnyWhitespace(char: string) {
	return /\s/.test(char)
}
