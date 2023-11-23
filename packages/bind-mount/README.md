# `@prairielearn/bind-mount`

This package allows for the creation and removal of bind mounts via native bindings to the [`mount()`](https://man7.org/linux/man-pages/man2/mount.2.html) and [`umount()`](https://man7.org/linux/man-pages/man2/umount.2.html) Linux system calls. These bindings are 1-2 orders of magnitude faster than shelling out to the `mount` and `umount` commands.

Only bind mounts are currently supported. It is not possible to create other type of mounts, or to change the flags used when creating the mount.

This package is only designed to work on Linux. It will compile on other platforms, but all functions will throw errors if they're called.

## Usage

```ts
import { mount, umount } from '@prairielearn/bind-mount';

await mount('/source', '/target');
await umount('/target');
```
