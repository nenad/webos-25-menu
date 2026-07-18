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
installer. Alternatively, run the following on a macOS or Linux computer
after replacing the example IP address:

```sh
curl -fsSL https://raw.githubusercontent.com/nenad/webos-25-menu/main/install.sh |
  bash -s -- 192.168.1.100
```

Open **webOS 25 Menu**, select the gear button, and choose **Enable**.

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
changes the next time it opens. Use **Hide Apps shortcut** to remove LG's Apps
shortcut from this custom menu without changing stock Home. In the weather
city field, press Enter to start editing; merely highlighting the field does
not open the keyboard. Press Enter again to close the keyboard and move focus
to **Save weather**.

Hourly Wikimedia Commons wallpapers are enabled by default. They use 1920px
landscape thumbnails, rotate once per hour with a crossfade, and refresh
their cached URL and attribution metadata daily. Attribution and a source
button are available in Settings. Select **Hourly Wikimedia wallpapers** to
disable network wallpaper loading and use the built-in neutral background.
If Commons is offline, a cached playlist is used when available; otherwise
the neutral background remains visible.

## Open automatically after startup

Home button integration starts the remote mapper at boot. To also open the
menu automatically 15 seconds after webOS starts, run:

```sh
curl -fsSL https://raw.githubusercontent.com/nenad/webos-25-menu/main/install.sh |
  bash -s -- 192.168.1.100 --autostart
```

This uses only the Homebrew startup directory. Remove the startup hook with:

```sh
TV_IP=192.168.1.100
ssh root@"$TV_IP" 'rm -f /var/lib/webosbrew/init.d/webos25menu-autostart'
```

## Disable or uninstall

Open the settings panel and choose **Disable** before uninstalling the IPK.
This stops the mapper, removes its startup hook, and restores a conflicting
mapper that setup previously disabled.

The application remains launchable normally after its Home-button integration
is disabled.
