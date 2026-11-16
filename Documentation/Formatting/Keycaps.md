You can show keys and shortcuts as keycaps in your notes. Write `⁅Enter⁆` and it renders like ⁅Enter⁆. Keycaps follow your note's theme, with rounded borders and raised edges.

You can also mark text to type, such as `⁅git status⁆`: ⁅git status⁆.

# Typing the Brackets

Only `⁅` and `⁆` delimit keycaps. Typing `[+` or `[-` offers `⁅` in the Unicode completion menu; typing `+]` or `-]` offers `⁆`. Press ⁅Enter⁆ or ⁅Tab⁆ to accept, or ⁅Escape⁆ to keep what you typed. Each accepted suggestion replaces the two typed characters in your source.

The ASCII forms `[+N+]` and `[-N-]` stay literal until you accept both replacements. `⹕N⹖` is also ordinary text. A partially replaced pair, such as `⁅N+]`, stays literal if no matching `⁆` follows on the same line. All other punctuation is label text: `⁅N+] [+N⁆` forms one keycap.

# Nesting

Write `⁅Ctrl⁆⁅C⁆` to display individual keys: ⁅Ctrl⁆⁅C⁆. Put another pair of brackets around them to group the keys inside a surrounding keycap: `⁅⁅Ctrl⁆⁅C⁆⁆` renders like ⁅⁅Ctrl⁆⁅C⁆⁆.

For a chord inside prose, `Please press ⁅⁅Ctrl⁆⁅Shift⁆⁅R⁆⁆ to redraw the page.` renders like this:

Please press ⁅⁅Ctrl⁆⁅Shift⁆⁅R⁆⁆ to redraw the page.

Further nesting adds another surrounding keycap without shrinking the labels. Tangent preserves your grouping without interpreting key names, simultaneous presses, or sequences.

# Editing and Literal Text

Move your text cursor into a keycap or click it to reveal and edit its source. The preview stays visible beside it; the source delimiters appear while editing.

Labels are plain text. Spaces, Unicode symbols, and Markdown punctuation are preserved. Formatting goes around keycaps rather than inside their labels: `**⁅Enter⁆**` renders like **⁅Enter⁆**.

Inside a label, escape `⁅`, `⁆`, or a backslash with a backslash. For example, `⁅\⁅N\⁆⁆` displays the literal label `⁅N⁆`, and `⁅\\⁆` displays a backslash. Other punctuation needs no escape: `⁅+⁆`, `⁅-⁆`, `⁅[⁆`, and `⁅]⁆` display ⁅+⁆, ⁅-⁆, ⁅[⁆, and ⁅]⁆.

To keep the whole construct literal, escape its opening bracket: `\⁅N⁆`. See [[Backslash Escapes]].

Keycaps must open and close on the same line, with at most 64 nesting levels. Empty and incomplete constructs stay literal. The syntax stays inactive in code, math, link text and destinations, and front matter. Delimiter suggestions are also suppressed in those contexts and HTML syntax.

# Portability

This syntax is a Tangent extension, so other Markdown renderers generally show the source punctuation. HTML export uses nested `<kbd>` elements with literal labels, preserving your grouping without adding display brackets.

The HTML `<kbd>` element represents user input, usually from a keyboard, but also including other input such as voice commands. Keycaps are Tangent's visual treatment of that markup. See [the HTML definition of `<kbd>`](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-kbd-element).
