# Platform documentation

The build generates `documentation-darwin.zip`, `documentation-win32.zip` and `documentation-linux.zip` from the same `Documentation/` tree. The running app selects its own archive. Generating every variant keeps cross-builds and multi-platform packaging independent of the build host.

Write a shortcut directive as `{{shortcut:Mod+C}}`. `Mod` becomes Command on macOS and Control elsewhere. When the complete binding differs, use `{{shortcut:darwin=Ctrl+Alt+Up;other=Alt+Shift+Up}}`; `win32` and `linux` alternatives can also be explicit. Directives inside inline code or fenced code are literal examples. Keep historical platform comparisons explicit rather than replacing arbitrary text.

The builder regenerates the archives on each build. Extraction compares both the app version and the selected archive's SHA-256 revision, so documentation changes at the same app version are refreshed too. The generated documentation directory is replaceable application data; author edits in the source tree.
