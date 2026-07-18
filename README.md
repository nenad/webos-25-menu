# webOS 25 Menu

A minimal, configurable Home screen for rooted LG TVs running webOS 25.

## Motivation

LG's default Home menu has become increasingly bloated, with promotional
content and interface sections competing with the apps people actually use.
At the same time, LG continues to push AI features and AI entry points
throughout the TV experience, even when they are not useful to every owner.

webOS 25 Menu provides a quieter alternative focused on:

- Installed applications
- A clock and optional weather
- Hourly Wikimedia Commons wallpapers without promotional content
- The same app selection and ordering as the original LG Home
- Predictable remote behavior

## Requirements

- Rooted LG TV running webOS 25 release 10.x
- LG Magic Remote
- Homebrew Channel installed and elevated
- Python 3 at `/usr/bin/python3`

This project is not a replacement firmware and does not modify kernel, rootfs,
tvservice, or `/usr`.

## Installation

### Download a release

Download `io.github.nenad.webos25menu_<version>_all.ipk` from the latest
release or CI artifact.

Install the IPK with webOS Dev Manager or another Homebrew-compatible package
installer, then:

1. Open **webOS 25 Menu** from the TV's application list.
2. Select the gear button in the bottom-right corner.
3. Under **Home button integration**, select **Enable**.
4. If an existing LG Input Hook or Magic Mapper installation is detected,
   review the warning and select **Disable conflicting mapper and enable**.

The remote is configured as follows:

- Short Home: open webOS 25 Menu
- Long Home: open the original LG Home
- Back inside webOS 25 Menu: ignored
- Long Back in another app: close it and return to webOS 25 Menu

The app row mirrors the applications shown by the original LG Home menu,
including their order. webOS 25 Menu deliberately does not maintain a second
visibility configuration. To add, remove, hide, or reorder apps, long-press
Home to open LG Home and make the change there. The custom menu picks up the
updated LG Home row the next time it opens.

### Wallpapers

Hourly Wikimedia wallpapers are enabled by default. The app requests
landscape-oriented featured pictures from the Wikimedia Commons Action API,
downloads 1920-pixel thumbnails, and crossfades to a new image each hour.
Only image URLs and attribution metadata are cached locally; the playlist is
refreshed once per day rather than whenever the menu opens.

Compact author and license attribution is shown on the Home screen. The
Settings panel includes the title, author, license, source URL, and a button
to open the Wikimedia source page. Select **Hourly Wikimedia wallpapers** in
Settings to turn the feature off and return to the built-in neutral
background. If Commons or an image is unavailable, the app uses cached
metadata where possible and otherwise keeps the neutral background.

### Build from source

Requirements on the build computer:

- Python 3
- Node.js
- Make

Build and validate the package:

```sh
make package
```

The resulting IPK is written to `dist/`.

## Disable or uninstall

Open webOS 25 Menu settings and select **Disable** before uninstalling the
application. This removes its startup hook and restores a conflicting mapper
that the installer previously disabled.

For recovery instructions and the exact writable paths used by the installer,
see [docs/SAFETY.md](docs/SAFETY.md). More detailed installation notes are in
[docs/INSTALL.md](docs/INSTALL.md).

## License

webOS 25 Menu is released under the MIT License. The remote input integration
is derived from Magic Mapper; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
