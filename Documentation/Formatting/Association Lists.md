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

An alternative form uses a plain term line ending in ` ::` and values beginning with `: ` at the same indentation:

```markdown
Earth ::
Terra ::
: The third planet from the Sun
: Our home
```

The trailing `::` identifies each term immediately; it does not depend on a later value line. A plain term must have no value after its first separator, so prose such as `name :: value` remains ordinary text. Colon values need a preceding bare term with no intervening blank line or unrelated paragraph. `::` and `:::` at the start of a line are not value markers.

Plain and list-marked terms can mix. A colon value may also be indented under a bare term, and plain terms can use indented list items for values. Nested plain terms and their colon values follow the same layout, collapse, and export rules as list-marked terms. Enter continues `: ` values; pressing Enter again on an empty value exits the list.

Terms use the normal note font and text color. Values are slightly smaller and muted. Ordinary extra spacing collapses when rendered; entering a line reveals its exact Markdown and spacing for editing. Explicit code spacing and authored nonbreaking spaces retain their meaning.

Use the gutter chevron to collapse a term. Its values remain as a single-line summary, fading toward a trailing `⋯`. Inline code retains its spacing without wrapping in a collapsed value. Expanding restores their layout, and moving the caret into a folded region reveals its source. Collapsing does not change the note text.
