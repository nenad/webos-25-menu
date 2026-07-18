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

## Disable or uninstall

Open the settings panel and choose **Disable** before uninstalling the IPK.
This stops the mapper, removes its startup hook, and restores a conflicting
mapper that setup previously disabled.

The application remains launchable normally after its Home-button integration
is disabled.
