# Documentation builds

The build packages `Documentation/` unchanged into one `documentation.zip` archive for every platform. Write static cross-platform instructions, explaining Command versus Control once and spelling out alternatives when complete bindings differ. Keep keycap markup in the source when desired; the build does not substitute shortcut labels or interpret documentation directives.

The builder regenerates the archives on each build. Extraction compares both the app version and the selected archive's SHA-256 revision, so documentation changes at the same app version are refreshed too. The generated documentation directory is replaceable application data; author edits in the source tree.
