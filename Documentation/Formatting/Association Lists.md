Association Lists pair terms with values, rendered as semantic `<dl>`, `<dt>`, and `<dd>` elements in exported HTML. Write a list item with a spaced `::` separator:

```markdown
- Mercury :: The innermost planet
- Venus ::
  - The second planet
  - Named for a Roman goddess
```

Only the first top-level ` :: ` separates the term from its value. Further separators belong to the value. Separators inside code, links, math, and inline glosses stay literal. A bare term can have several values as directly indented list items; nested terms form nested Association Lists.

Consecutive bare terms share the values that follow the last term:

```markdown
- Earth ::
- Terra ::
  - The third planet from the Sun
```

The values sit beside the whole term group. Use the last term's gutter chevron to collapse them; all terms remain visible. A blank line or a term with its own value or nested list starts a separate group.

Indent child terms to nest an Association List. Its first row starts beside the parent, and the parent spans the nested rows:

```markdown
- Solar System ::
  - Terrestrial planets ::
    - Mercury :: The innermost planet
    - Venus :: The second planet
```

Spaces or tabs can provide the indentation. Collapsing a parent summarizes its descendants; expanding restores the nested layout. If the last term in a shared group has an inline value, that value stays on its own term's row.

Terms use the normal note font and text color. Values are slightly smaller and muted. Ordinary extra spacing collapses when rendered; entering a line reveals its exact Markdown and spacing for editing. Explicit code spacing and authored nonbreaking spaces retain their meaning.

Use the gutter chevron to collapse a term. Its values remain as a single-line summary, fading toward a trailing `⋯`. Inline code retains its spacing without wrapping in a collapsed value. Expanding restores their layout, and moving the caret into a folded region reveals its source. Collapsing does not change the note text.
