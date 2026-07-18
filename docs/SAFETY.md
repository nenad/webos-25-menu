# Safety and recovery

webOS 25 Menu does not remount or write to kernel, rootfs, tvservice, or
`/usr`. Its setup code is intentionally restricted to:

```text
/media/developer/apps/usr/palm/applications/io.github.nenad.webos25menu
/home/root/.local/share/webos25menu
/home/root/.config/webos25menu
/var/lib/webosbrew/init.d/webos25menu
```

When explicitly asked to resolve a conflict, it may only change the executable
mode of these existing Homebrew startup hooks:

```text
/var/lib/webosbrew/init.d/inputhook
/var/lib/webosbrew/init.d/start_magic_mapper
```

Their previous enabled state is recorded and restored by **Disable**.

## Emergency disable over SSH

If remote input behaves unexpectedly:

```sh
chmod 0644 /var/lib/webosbrew/init.d/webos25menu
pkill -f '^/usr/bin/python3 -u /home/root/.local/share/webos25menu/remote_mapper.py$'
```

The kernel releases the mapper's exclusive input-device grab when the process
exits. Reboot afterward if another input hook had already been injected.

Do not copy, flash, overwrite, or modify kernel, rootfs, or tvservice images.
