Association Lists pair terms with descriptions, rendered as semantic `<dl>`, `<dt>`, and `<dd>` elements in exported HTML. Write a list item with a spaced `::` separator:

```markdown
- Mercury :: The innermost planet
- Venus ::
  - The second planet
  - Named for a Roman goddess
```

Only the first top-level ` :: ` separates the term from its description. Further separators belong to the description. Separators inside code, links, math, and inline glosses stay literal. A bare term can have several descriptions as directly indented list items; nested terms form nested Association Lists.

Terms use the normal note font and text color, with a subtly lighter background in dark themes. Descriptions are slightly smaller and muted. Ordinary extra spacing collapses when rendered; entering a line reveals its exact Markdown and spacing for editing. Explicit code spacing and authored nonbreaking spaces retain their meaning.

Use the gutter chevron to collapse a term. Its descriptions remain as a single-line summary, clipped with an ellipsis when needed. Inline code retains its spacing without wrapping in a collapsed description. Expanding restores their layout, and moving the caret into a folded region reveals its source. Collapsing does not change the note text.
