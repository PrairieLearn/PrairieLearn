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

The [`pl-image-capture`](../elements.md#pl-number-input-element) element lets users capture images of submitted work through an external device, such as a mobile device or tablet, or a local camera.

To use external capture locally, you must set `serverCanonicalHost` in `config.json` to your local IPv4 address.

To retrieve your local IPv4 address, if you're on

- macOS: in Terminal, run `ifconfig | grep "inet " | grep -Fv 127.0.0.1 | awk '{print $2}'`

- Linux: in your terminal, run `ip -o route get to 8.8.8.8 | sed -n 's/.*src \([0-9.]\+\).*/\1/p'`

- Windows: in Command Prompt, run `ipconfig | findstr /C:"IPv4"`

Copy the first address you see, and paste it into the `serverCanonicalHost` property of your `config.json` file.

For example, if your IPv4 is `192.168.1.60`, your file should read:

```json title="config.json"
{
  "serverCanonicalHost": "192.168.1.60"
}
```
