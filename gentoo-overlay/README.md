# Tangent Gentoo Overlay (Unofficial)

This overlay provides an unofficial Gentoo package for this fork:

- `app-editors/tangent` (source build, offline vendor inputs)
- `app-editors/tangent-bin`

The package currently uses prebuilt release assets from:

- <https://github.com/visrosa/Tangent/releases>

It extracts `linux-unpacked` from a release tarball, installs only the Tangent app payload (`app.asar`) and desktop integration files, then runs it with system Electron (`virtual/electron`).

## Add this overlay

Using `eselect-repository`:

```bash
sudo eselect repository add tangent-overlay git https://github.com/visrosa/Tangent.git
sudo emaint sync -r tangent-overlay
```

Or place this directory as a local overlay and add it to `repos.conf`.

## Install

```bash
sudo emerge --ask app-editors/tangent
# or
sudo emerge --ask app-editors/tangent-bin
```

## Notes

- This packaging is provided as-is and is not supported by upstream Tangent maintainers.
- Future work may add a source-integrated package (`app-editors/tangent`) separately.
