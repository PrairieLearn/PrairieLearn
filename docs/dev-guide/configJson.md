# Server Configuration

Various properties of the PrairieLearn server can be modified by creating a `config.json` file in the root of the PrairieLearn source directory and updating values in the JSON file.

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

If you are running workspaces natively on Mac OS, you may need to change `"workspaceDevContainerHostname"` to "localhost".

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

When testing [docker images](../dockerImages.md) locally, you may want to force PrairieLearn to use the local version of an image.

```json title="config.json"
{
  "workspacePullImagesFromDockerHub": false,
  "externalGradingPullImagesFromDockerHub": false
}
```

## Enterprise

Some features of PrairieLearn are only available in the Enterprise Edition.

```json title="config.json"
{
  "isEnterprise": true
}
```
