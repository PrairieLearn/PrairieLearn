# Running Workspaces

## Set up S3

1. Put the `aws-config.json` file that contain your `accessKeyId` and `secretAccessKey` in the main PL directory. See https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-json-file.html for the format of this file, but note that it must be called `aws-config.json` for PL.

2. Change the `workspaceS3Bucket` parameter in PL's `config.json` to a bucket that you have access to in your AWS account. We will be storing code in folders called `workspace-*` in that bucket.


## Make sure you have no docker containers running

1. Run `docker ps -a`. Kill any running containers with `docker kill CONTAINER_NAME` and remove all containers with `docker rm CONTAINER_NAME`.

2. Check again with `docker ps -a` to make sure there are no containers listed.


## Run PL and the workspace interface

1. Run PL inside docker, using the [external grading flags](https://prairielearn.readthedocs.io/en/latest/externalGrading/#running-locally-for-development). For example:

```
docker run -it --rm -p 3000:3000 -v "$HOME/pl_ag_jobs:/jobs" -e HOST_JOBS_DIR="$HOME/pl_ag_jobs" -v /var/run/docker.sock:/var/run/docker.sock -v $PWD:/PrairieLearn prairielearn/prairielearn
```

2. Run `interface.js` inside the same container as PL using:

```sh
$ docker exec -it CONTAINER_NAME /bin/bash
$ cd /PrairieLearn
$ node workspace_host/interface
```


## Test the VS Code workspace

1. Using Chrome (apparently Safari doesn't work), go to http://localhost:3000 and "Load from disk", then navigate to `exampleCourse -> Questions -> Workspace demo: VS Code`.

2. Click the `Open workspace` button.

3. In the new tab, wait for 10 seconds, then reload the page. You should see VS Code load in an iframe.


## Test the Xterm.js workspace

1. Build the container in `workspaces/xtermjs`.

```sh
$ docker build workspaces/xtermjs -t "prairielearn/workspace-xtermjs"
```

2. Navigate to `exampleCourse -> Questions -> Workspace demo: Xterm.js` and click the `Open workspace` button.


## Test the JupyterLab workspace

1. Build the container in `workspaces/jupyterlab`.

```sh
$ docker build workspaces/jupyterlab -t "prairielearn/workspace-jupyterlab"
```

2. Navigate to `exampleCourse -> Questions -> Workspace demo: JupyterLab` and click the `Open workspace` button.


## Notes for running natively

In principle you can run both PL and `interface.js` natively, by setting `"workspaceNativeLocalhost": "localhost"` in PL's `config.json`. It's not clear whether this is currently working.
