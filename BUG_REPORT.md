# Bug Report Draft — hiddenGroup Instance Accounting

Draft GitHub issue for `suchnsuch/Tangent`, describing the bug that `hiddenGroups-flattening-fix` (PR1, see `TODO.md#Package feature/furigana as Two Upstream PRs`) fixes. Edit freely before filing — not part of the plan record, just a staging area. Link the PR with "Fixes #\<issue number\>" once both exist.

---

## Title

Adjacent identical hidden-group spans (inline math, etc.) can end up sharing one instance

## Summary

Inline formats that use the `hiddenGroup` attribute to keep raw Markdown source around alongside a rendered output (currently just inline math, `$...$`) don't carry any per-instance identity — only their content. When two such spans sit next to each other with identical content, a few different parts of the editor have no way to tell them apart, and end up treating the pair as one.

This shows up in three separate ways:

### 1. Adjacent spans render as one element

Rendering has an adjacent-node merge pass (`mergeChildren`) that folds sibling nodes together when they look the same — a reasonable optimization for ordinary formatting runs, where two adjacent bold spans really are the same run. It predates `hiddenGroup` spans needing to stay atomic per instance, so it doesn't know to leave them alone, and folds two identical ones together the same way.

**Steps to reproduce:**
1. Type two adjacent, identical inline math expressions on one line, e.g. `$a$$a$`.
2. Observe the rendered line.

**Expected:** two separate rendered math elements, side by side.

**Actual:** only one is visible — the second instance's content ends up folded into the first's container by the merge pass.

### 2. Adjacent spans merge into one operation on line reformat

**Steps to reproduce:**
1. Type two adjacent, identical inline math expressions on one line, e.g. `$a$$a$`.
2. Type one more character anywhere on the same line (any further edit re-triggers Tangent's line-reformat pass).
3. Try to select or delete just the first instance.

**Expected:** the two instances stay independently addressable — selecting or deleting one doesn't affect the other.

**Actual:** after reformatting, the two instances have merged into a single internal operation. They can no longer be selected, edited, or deleted independently — acting on one acts on both.

### 3. Clicking/selecting one instance can select or cut its neighbor too

**Steps to reproduce:**
1. Type two adjacent, identical inline math expressions (or an inline embed followed by a link/embed to the same target).
2. Click, double-click, or right-click on the first instance; or select it and Cut.

**Expected:** only the clicked/selected instance is affected.

**Actual:** selection can walk across the boundary into the neighboring instance, since the code resolving the click only compares by value (math source, link href) rather than by which specific instance was clicked. Cut can remove more than intended.

## Environment

Reproducible on unmodified `upstream/main`, current release build. Not specific to any OS.

## Additional context

All three come down to the same gap — value-equality standing in for instance identity — showing up independently in three different subsystems: the ops model's line-reformat merge, inline click-selection resolution, and the render layer's adjacent-node merge optimization. The third one (rendering) is the most understandable of the three — merging visually-identical adjacent nodes is a sensible default outside of hiddenGroup's atomic-per-instance case — but all three need hiddenGroup spans to be excluded from a merge that otherwise makes sense for its usual case.

In practice this is a narrow edge case rather than a common one: two adjacent, identical hiddenGroup spans aren't a pattern most content produces. It matters more for formats meant to repeat short identical content next to itself (e.g. a planned furigana format, where the same short reading could plausibly recur), even there it's possible rather than likely.
