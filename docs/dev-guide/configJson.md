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

Secrets that support application-managed rotation can be configured as an ordered, nonempty array while retaining scalar compatibility. See [Rotating application-managed keys](keyRotation.md) for supported properties and the required deployment sequence.

## Instructor support links

The **Get help** dialog provides documentation and email support for course staff. Set `supportSlackUrl` to the Slack invitation URL and `supportOfficeHoursUrl` to the Zoom office-hours URL to include those options. Both require HTTPS and default to `null`, which hides the corresponding option. Keep invitation and meeting URLs in deployment configuration rather than public source files.

Configure and deploy these links before removing the existing links from your public support site.

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

### Running PrairieLearn natively

!!! note

    This section applies to [native installations](installingNative.md), where PrairieLearn runs directly on your computer. If you start PrairieLearn with `docker run`, follow the [Docker instructions for workspaces and external graders](../installing.md#support-for-external-graders-and-workspaces) instead and leave the directory, hostname, and ownership settings below at their defaults.

Set the directories used to store workspace files in your `config.json`:

```json title="config.json"
{
  "workspaceHostHomeDirRoot": "/tmp/workspace",
  "workspaceHomeDirRoot": "/tmp/workspace"
}
```

#### Workspace file ownership

Run PrairieLearn and the workspace host as your regular user, without `sudo`, and leave `workspaceJobsDirectoryOwnerUid` and `workspaceJobsDirectoryOwnerGid` at their defaults. Docker lets a regular user start containers that run as root (on Linux, your user must be in the `docker` group). If necessary, workspace images can change the owner of the workspace files to UID 1001, and then switch to that user.

When PrairieLearn and the workspace host run as root, as they do in production and in the Docker-based installation, they also change the owner of the workspace files to `workspaceJobsDirectoryOwnerUid`/`workspaceJobsDirectoryOwnerGid` before starting the container. They skip this step when running as a regular user, since only root can change file ownership.

On Linux and WSL, the workspace files on your machine end up owned by UID 1001, so you may need `sudo` to delete old workspace directories. If a student creates workspace files that only their owner can read, PrairieLearn may also be unable to collect them as graded files. If this is a problem, run both processes as root instead:

```sh
sudo make dev-workspace-host
sudo make dev
```

#### Running natively on WSL

If you are running workspaces on WSL, since Docker Desktop runs outside the specific WSL instance you are using, you may in some cases need to specify the `"workspaceDevContainerHostname"` in your `config.json` to be the IP address of your Windows host. You can find this by running `ip route` in the WSL instance. For example, if the output of `ip route` starts with `default via 172.30.112.1 dev ...`, you would set the following in your `config.json`:

```json title="config.json"
{
  "workspaceDevContainerHostname": "172.30.112.1"
}
```

#### Running natively on macOS

On macOS, set `"workspaceDevContainerHostname"` to `"localhost"`:

```json title="config.json"
{
  "workspaceDevContainerHostname": "localhost"
}
```

Don't run PrairieLearn or the workspace host with `sudo` on macOS. Docker Desktop lets a container change the owner of bind-mounted files without changing their owner on your Mac, but only if your user owns them. Running with `sudo` creates root-owned workspace files, and workspaces then fail with errors like:

```text
chown: changing ownership of '/home/coder/workspace': Permission denied
chown: changing ownership of '/home/coder/workspace/fibonacci.py': Permission denied
```

To fix this, delete your workspace directory (for example, `sudo rm -rf /tmp/workspace`) and restart PrairieLearn and the workspace host without `sudo`.

### Testing local Docker images

In both Docker and native installations, you can use locally built [Docker images](../dockerImages.md) by disabling image pulls in `config.json`:

```json title="config.json"
{
  "workspacePullImagesFromDockerHub": false,
  "externalGradingPullImagesFromDockerHub": false
}
```

These options are independent and both default to `true`.

## Enterprise

Some features of PrairieLearn are only available in the Enterprise Edition. Note that you must adhere to the [PrairieLearn license](https://github.com/PrairieLearn/PrairieLearn/blob/master/LICENSE) when setting this option.

```json title="config.json"
{
  "isEnterprise": true
}
```
