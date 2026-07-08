# Server Configuration

Various properties of the PrairieLearn server can be configured with a `config.json` file. Configuration is loaded from multiple locations and merged together, with values from later files taking precedence over earlier ones:

1. `~/.config/prairielearn/config.json` (the user's home directory - not applicable when running in Docker)
2. `./config.json` (the repository root directory)
3. `./apps/*/config.json` (the application root directories)

For example, if `./config.json` sets `"courseDirs"` and `./apps/prairielearn/config.json` sets `"isEnterprise"`, the final configuration will include both values. If both files set the same property, the value from `./apps/prairielearn/config.json` will be used.

The file is structured as a JSON dictionary with the following syntax:

```json title="config.json"
{
  "property1": "...",
  "property2": "...",
  "property3": "..."
}
```

A full list of properties can be found in [`lib/config.ts`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/lib/config.ts).

## Setting Course Directories

The default course directories to be loaded by PrairieLearn can be overridden with the `"courseDirs"` setting. This setting takes a list of paths to load that are located _in the Docker container_.

```json title="config.json"
{
  "courseDirs": ["exampleCourse", "testCourse", "/myCourse"]
}
```

!!! note

    These directories are paths in the container, not on your local computer.

To mount a directory on your computer so that it is accessible in the container, you can add the following to your Docker run command:

```sh
-v /path/to/myCourse:/myCourse
```

Then, the path will be accessible at `/myCourse` (note the beginning slash).

## Setting up external image capture locally

The [`pl-image-capture`](../elements/pl-image-capture.md) element lets users capture images of submitted work through an external device, such as a mobile device or tablet, or a local camera.

To use external capture locally, you must set `serverCanonicalHost` in `config.json` to your local IPv4 address.

To retrieve your local IPv4 address, if you're on

- macOS: in Terminal, run `ifconfig | grep "inet " | grep -Fv 127.0.0.1 | awk '{print $2}'`

- Linux: in your terminal, run `ip -o route get to 8.8.8.8 | sed -n 's/.*src \([0-9.]\+\).*/\1/p'`

- Windows: in Command Prompt, run `ipconfig | findstr /C:"IPv4"`

Copy the first address you see, and paste it into the `serverCanonicalHost` property of your `config.json` file.

For example, if your IPv4 is `192.168.1.60` and PL is running on port `3000`, your file should read:

```json title="config.json"
{
  "serverCanonicalHost": "http://192.168.1.60:3000"
}
```

## Workspaces and external graders

You should set the workspace host home directory root and home directory root in your `config.json`.

```json title="config.json"
{
  "workspaceHostHomeDirRoot": "/tmp/workspace",
  "workspaceHomeDirRoot": "/tmp/workspace"
}
```

### Running workspaces / external graders natively on Linux or WSL

On Linux environments (including WSL on Windows), Docker Desktop allows any user with the `docker` group to run containers, even as root. However, the default configuration of PrairieLearn will attempt to change the owner of the workspace files to the root user before running the workspace container, which will fail if the user is not root. To avoid a problem in these scenarios, you have two options:

1. Change the configuration of the workspace host to not chown the workspace files. You can do this by including the following in your `config.json` (assuming the user you are running the workspace host as has UID 1000 and GID 1000):

   ```json title="config.json"
   {
     "workspaceJobsDirectoryOwnerGid": 1000,
     "workspaceJobsDirectoryOwnerUid": 1000,
     "workspaceMappedGid": 0,
     "workspaceMappedUid": 0
   }
   ```

2. Run PrairieLearn and the workspace host as root, which will allow the workspace host to chown the workspace files to root before running the workspace container. You can do this by running:

   ```sh
   sudo make dev-workspace-host
   sudo make dev
   ```

For WSL in particular, since Docker Desktop runs outside the specific WSL instance you are using, you may in some cases need to specify the `"workspaceDevContainerHostname"` in your `config.json` to be the IP address of your Windows host. You can find this by running `ip route` in the WSL instance. For example, if the output of `ip route` starts with `default via 172.30.112.1 dev ...`, you would set the following in your `config.json`:

```json title="config.json"
{
  "workspaceDevContainerHostname": "172.30.112.1"
}
```

### Running workspaces / external graders natively on macOS

If you are running workspaces natively on macOS, you may need to change `"workspaceDevContainerHostname"` to "localhost".

```json title="config.json"
{
  "workspaceDevContainerHostname": "localhost"
}
```

Certain images detect if you are running as root and try to chown the workspace files to the user 1001 before stepping down to the user 1001 (`pl-gosu-helper.sh`). On macOS, this will fail because bind mounts cannot be chown'd (FUSE-based filesystems). To fix this, you can set `"workspaceJobsDirectoryOwnerUid"` and `"workspaceJobsDirectoryOwnerGid"` to 1001 in your `config.json`.

```json title="config.json"
{
  "workspaceJobsDirectoryOwnerUid": 1001,
  "workspaceJobsDirectoryOwnerGid": 1001
}
```

Many containers can only run as UID 1001 or 0. Make sure you run as root locally!

```sh
sudo make dev-workspace-host
sudo make dev
```

If you don't both of these commands, you will see errors like:

```text
chown: changing ownership of '/home/coder/workspace': Permission denied
chown: changing ownership of '/home/coder/workspace/fibonacci.py': Permission denied
```

### Testing local docker images

When testing [docker images](../dockerImages.md) locally, you may want to force PrairieLearn to use the local version of an image.

```json title="config.json"
{
  "workspacePullImagesFromDockerHub": false,
  "externalGradingPullImagesFromDockerHub": false
}
```

## Enterprise

Some features of PrairieLearn are only available in the Enterprise Edition. Note that you must adhere to the [PrairieLearn license](https://github.com/PrairieLearn/PrairieLearn/blob/master/LICENSE) when setting this option.

```json title="config.json"
{
  "isEnterprise": true
}
```
