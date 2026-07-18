# Install webOS 25 Menu

## Requirements

- A rooted TV running webOS 25 release 10.x
- LG Magic Remote input devices
- Homebrew Channel installed and elevated
- Python 3 available at `/usr/bin/python3`

## Build

Run:

```sh
make package
```

The installable package is written to:

```text
dist/io.github.nenad.webos25menu_<version>_all.ipk
```

## Install

Install the IPK with webOS Dev Manager or another Homebrew-compatible package
installer. Open **webOS 25 Menu**, select the gear button, and choose
**Enable**.

If LG Input Hook or an older Magic Mapper startup hook is enabled, setup stops
without changing it. Review the warning and choose **Disable conflicting
mapper and enable** to let webOS 25 Menu preserve and disable that hook.

The button behavior is:

- Short Home: open webOS 25 Menu
- Long Home: open stock LG Home
- Back in webOS 25 Menu: ignored
- Long Back in another app: close it, then open webOS 25 Menu

The app row mirrors the visible launch points and ordering from stock LG Home.
Long-press Home and manage the row in LG Home; the custom menu reads those
changes the next time it opens. In the weather city field, press Enter to
start editing; merely highlighting the field does not open the keyboard.
Press Enter again to close the keyboard and move focus to **Save weather**.

Hourly Wikimedia Commons wallpapers are enabled by default. They use 1920px
landscape thumbnails, rotate once per hour with a crossfade, and refresh
their cached URL and attribution metadata daily. Attribution and a source
button are available in Settings. Select **Hourly Wikimedia wallpapers** to
disable network wallpaper loading and use the built-in neutral background.
If Commons is offline, a cached playlist is used when available; otherwise
the neutral background remains visible.

## Disable or uninstall

Open the settings panel and choose **Disable** before uninstalling the IPK.
This stops the mapper, removes its startup hook, and restores a conflicting
mapper that setup previously disabled.

The application remains launchable normally after its Home-button integration
is disabled.
