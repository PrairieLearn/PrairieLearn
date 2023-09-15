# Server Configuration

Various properties of the PrairieLearn server can be modified by creating a `config.json` file in the root of the PrairieLearn source directory and updating values in the JSON file.

The file is structured as a JSON dictionary with the following syntax:

```json
{
  "property1": "...",
  "property2": "...",
  "property3": "..."
}
```

A full list of properties can be found in [`lib/config.js`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/lib/config.js).

## Setting Course Directories

The default course directories to be loaded by PrairieLearn can be overridden with the `"courseDirs"` setting. This setting takes a list of paths to load that are located _in the Docker container_.

```json
{
  "courseDirs": ["exampleCourse", "testCourse", "/myCourse"]
}
```

Note that these directories are paths in the container, not on your local computer. To mount a directory on your computer so that it is accessible in the container, you can add the following to your Docker run command:

```sh
-v /path/to/myCourse:/myCourse
```

Then, the path will be accessible at `/myCourse` (note the beginning slash).
