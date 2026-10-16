Footnotes connect a short reference in your text to a longer explanation or citation. Tangent supports [GitHub's footnote syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#footnotes):

```md
An observation[^source], mentioned again[^source].

## Sources

[^source]: A citation or explanation, with **formatting** and [links](https://example.com).
    A continuation line.

    Another paragraph, indented by four spaces.
```

References with a name, such as `[^source]` or `[^uax15]`, display that literal key in superscript. Digit-only keys display their assigned number, ordered by first reference in the note. Repeated references resolve to the same definition. References use the color and hover underline of internal links. Keys stay exactly as written in your Markdown, and matching ignores case.

Hover over a reference to preview its definition. Click it to jump to the definition; click the definition's return marker to go back to the reference you followed. Move the text cursor into a marker to edit its original syntax. A folded destination becomes visible when you navigate to it.

Definitions stay where you wrote them. They can precede or follow their references, and an optional `Sources` heading remains available in the [[Outline]]. Indent continuation paragraphs by four spaces or a tab. Definition content uses Tangent's usual Markdown formatting; the hover preview displays its source as text.

An undefined reference displays its original marker. An unused definition stays visible without a number. If a key is defined more than once, the first definition is used and the others keep their literal markers. Markers inside [[Code]] or [[Front Matter]], and markers escaped with a backslash, stay literal.
