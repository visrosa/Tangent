# Keyboard Input

Write `[+N+]`, `[-N-]`, `⁅N⁆`, or `⹕N⹖` to mark keyboard input. All four spellings display as a keycap labelled N and have the same meaning. Keycaps have rounded borders and raised edges, with colours following the note's theme. Tangent preserves the spelling you typed when saving or copying Markdown; source delimiters appear when editing rather than around the rendered label.

Typing `[+` or `[-` offers `⁅` and `⹕` in the Unicode completion menu; typing `+]` or `-]` offers `⹖` and `⁆`. Use the arrow keys to choose and Enter or Tab to substitute, or Escape to keep the ASCII source. Substitutions replace the stored text only when accepted. Choose the matching closing bracket: partially substituted pairs such as `⁅N+]` remain literal until both delimiters match.

## Nesting

Enclose individual keys in another input span to group them:

```md
[+[+⎇+][+N+]+]
[-[-⎇-][-N-]-]
[+[-⎇-][+N+]+]
⁅⹕⎇⹖⹕N⹖⁆
[+⹕⎇⹖⁅N⁆+]
```

All five display as two individual keycaps, ⎇ and N, inside a surrounding group keycap. Further nesting adds another surrounding keycap without shrinking the labels. Every spelling works at any depth, and different spellings may nest. Each opening delimiter requires its own matching closer: `[+` with `+]`, `[-` with `-]`, `⁅` with `⁆`, and `⹕` with `⹖`.

Adjacent spans stay separate: `[+⎇+][+N+]` displays as two keycaps without a surrounding group. Tangent preserves the grouping you write without interpreting key names, simultaneous presses, or sequences.

For a chord inside prose:

```md
Please press [+[+Ctrl+][+Shift+][+R+]+] to redraw the page.
```

## Editing and Literal Text

Move the cursor into a span or click its preview to reveal and edit the original source. The preview remains visible beside it.

Labels are literal text: whitespace, Unicode symbols, and Markdown punctuation are preserved. Formatting can surround an input span, as in `**[+Enter+]**`, but is not parsed inside its label.

Inside a span, escape `[`, `]`, `+`, `-`, `⁅`, `⁆`, `⹕`, `⹖`, or a backslash with a backslash to display that character literally. For example, `[+\[+N\+\]+]` displays the label `[+N+]`, and `⁅\⹕N\⹖⁆` displays the label `⹕N⹖`. A plus key itself can be written `[+++]`; a minus key can be written `[---]`. Outside a span, `\[+N+]` or `\⁅N⁆` keeps the opening bracket literal, as described in [[Backslash Escapes]].

Empty, mismatched, incomplete, and cross-line constructs remain literal source. Input spans must fit on one line, with at most 64 nesting levels. Keyboard syntax stays inactive in code, math, link text and destinations, and frontmatter. Delimiter substitutions are also suppressed in these contexts and HTML syntax.

## Portability

This syntax is a Tangent extension. Other Markdown renderers generally show the source punctuation. HTML export emits nested `<kbd>` elements with literal labels, preserving grouping without depending on Tangent's custom preview element or adding display brackets to the text.
