# Keyboard Input

Write `[+N+]` or `[-N-]` to mark keyboard input. Both spellings display as ⁅N⁆ and have the same meaning. Tangent preserves the spelling you typed when saving or copying Markdown.

## Nesting

Enclose individual keys in another input span to group them:

```md
[+[+⎇+][+N+]+]
[-[-⎇-][-N-]-]
[+[-⎇-][+N+]+]
```

All three display as ⁅⹕⎇⹖⹕N⹖⁆. Outermost spans use `⁅…⁆`; every nested span uses `⹕…⹖`, including nesting beyond two levels. The brackets are a Tangent display convention. Either spelling works at any depth; an opening `[+` closes with `+]`, and an opening `[-` closes with `-]`.

Adjacent spans stay separate: `[+⎇+][+N+]` displays as ⁅⎇⁆⁅N⁆. Tangent preserves the grouping you write without interpreting key names, simultaneous presses, or sequences.

## Editing and Literal Text

Move the cursor into a span or click its preview to reveal and edit the original source. The preview remains visible beside it.

Labels are literal text: whitespace, Unicode symbols, and Markdown punctuation are preserved. Formatting can surround an input span, as in `**[+Enter+]**`, but is not parsed inside its label.

Inside a span, escape `[`, `]`, `+`, `-`, or a backslash with a backslash to display that character literally. For example, `[+\[+N\+\]+]` displays the label `[+N+]`. A plus key itself can be written `[+++]`; a minus key can be written `[---]`. Outside a span, `\[+N+]` keeps the opening bracket literal, as described in [[Backslash Escapes]].

Empty, mismatched, incomplete, and cross-line constructs remain literal source. Input spans must fit on one line, with at most 64 nesting levels. Keyboard syntax stays inactive in code, math, link text and destinations, and frontmatter. The displayed brackets themselves are not source delimiters.

## Portability

This syntax is a Tangent extension. Other Markdown renderers generally show the source punctuation. HTML export emits nested `<kbd>` elements with literal labels, preserving grouping without depending on Tangent's custom preview element or adding display brackets to the text.
