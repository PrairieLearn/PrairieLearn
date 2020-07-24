# How to Run

1. Put the `aws-config.json` file that contain your `accessKeyId` and `secretAccessKey` in the main PL directory. See https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-json-file.html for the format of this file, but note that it must be called `aws-config.json` for PL.

2. Change the `workspaceS3Bucket` parameter in PL's `config.json` to a bucket that you have access to in your AWS account. We will be storing code in folders called `workspace-*` in that bucket.

3. Run PL, either inside docker or natively.

If you are running natively, in PL's `config.json` set `"workspaceNativeLocalhost": "localhost"`.

4. Run `interface.js`.

If you are running PL natively (outside docker), just run `node workspace_host/interface` from the main PL directory.

If you are running PL inside docker, run the following commands **inside the container**:

```sh
$ docker exec -it CONTAINER_NAME /bin/bash
$ cd /PrairieLearn
$ node workspace_host/interface
```

5. Navigate to `exampleCourse -> Questions -> Workspace demo` and click the `Open workspace` button.

# Using the xterm.js workspace

Build the container in `workspaces/xtermjs`

```sh
$ docker build workspaces/xtermjs -t "prairielearn/workspace-xtermjs"
```

Because the container image is currently hardcoded, you will need to update `Image` in `workspace_host/interface.js`.
In the function `_createContainer()`, update the `Image` attribute to `prairielearn/workspace-xtermjs`.
The exposed ports and bindings do not need to be changed; you can update them, but it will run as-is.
