
# Installing with local source code

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows.

* First install the Docker version of PrairieLearn as described in the [installation documentation](installing.md).

* Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Install the Node.js packages.  This will use the version of `npm` that is pre-installed in the Docker image, so you don't need your own copy installed.

```sh
docker run --rm -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /usr/local/bin/npm ci
```

The path `/path/to/PrairieLearn` should be replaced with the *absolute* path to the PrairieLearn source on your computer.  If you're in the root of the source directory already, you can substitute `%cd%` (on Windows cmd), `${PWD}` (on Windows PowerShell), or `$PWD` (Linux, MacOS, and WSL) for `/path/to/PrairieLearn`.

By default, PrairieLearn will load `exampleCourse`, `testCourse`, and any courses mounted at `/course` and `/course[2-9]` in the Docker container.  To override this behavior, you can create a custom [`config.json` file](configJson.md).

* Run it with:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn
```

By default, PrairieLearn does not monitor for server-side changes, so it will **not** automatically restart the node server when you change the node source. To enable automatic live-reloading of server-side changes, use the `-e` flag to set the `NODEMON=true` environment variable:

```sh
docker run -it --rm -p 3000:3000 -e NODEMON=true -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn
```

### Running a specific branch

By default, the above command will run PrairieLearn from the branch that is currently checked out in the directory `/path/to/PrairieLearn`. So, to run a different branch, just use commands like `git checkout BRANCH_NAME` or equivalent.

It is also possible to run a branch other than `master` without cloning or checking out the code for that branch, as long as the branch has been pushed to GitHub.  If you would like to run a different branch (to test it, for example), the branch name can be appended to the end of the image name as such:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn:BRANCH_NAME
```

Note that any forward slashes (`/`) in the branch name will be need to be converted to underscores (`_`). Also note that docker does not pull branch changes by default, so you are encouraged to update the local docker cached image by using this command before starting the container above:

```sh
docker pull prairielearn/prairielearn:BRANCH_NAME
docker run -it --rm -p 3000:3000 prairielearn/prairielearn:BRANCH_NAME
```

### Running commands in Docker

If needed, you can run the container with a different command:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn COMMAND
```

This can be used to, e.g., run scripts distributed with PrairieLearn by opening a bash shell:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash
```

#### Restarting the node server

When making local changes to server-side code, it is faster to restart only the node server instead of the whole docker container. This can be done either

* automatically by using the `-e NODEMON=true` setting as described earlier,

* or manually by starting the server from a shell instance:

```sh
/PrairieLearn/docker/init.sh
```

and when any modifications are made, you can close the server with `<ctrl-C>` and re-run the init script.

#### Tests from shell

The linters and tests for the Python and JavaScript code can be run with the following commands in a shell instance:

```sh
cd /PrairieLearn
./docker/start_postgres.sh
./docker/lint_js.sh
./docker/lint_python.sh
./docker/test_js.sh
./docker/test_python.sh
```

### Connecting to an existing Docker container

The previous shells were launched in their own containers. If you want to open a shell in a Docker container that is *already running*, you can find the container's name and connect to it.

* Find the name of your running PrairieLearn container by running

```sh
docker ps
```

which will output multiple columns of information about your running container(s). Look for the `prairielearn/prairielearn` image and copy its corresponding name. For example, the name of the PrairieLearn container in this `docker ps` output is `upbeat_roentgen`:

```
CONTAINER ID  IMAGE                      COMMAND              CREATED      STATUS      PORTS                   NAMES
e0f522f41ea4  prairielearn/prairielearn  "/bin/sh -c /Prai…"  2 hours ago  Up 2 hours  0.0.0.0:3000->3000/tcp  upbeat_roentgen
```


* Open a shell in your PrairieLearn container by running

```sh
docker exec -it CONTAINER_NAME /bin/bash
```

### Using tmux in a container

While developing, you might need or want to run multiple programs simultaneously (e.g., querying in `psql` without killing the `node` server). Rather than repeatedly canceling and restarting programs back and forth, you can use a terminal multiplexer like `tmux` to keep them running simultaneously.

The PrairieLearn Docker images are built with `tmux` installed. If you start a container with a shell then you can first run `tmux` before running other commands.

Tmux creates virtual windows which run simultaneously (you only see one window at a time). Tmux is controlled by typing a `Ctrl-b` and then another key. The basic commands are:

* `Ctrl-b` `c` - create a new window
* `Ctrl-b` `0` - switch to window number 0 (also `Ctrl-b` `1` switches to window 1, etc.)
* `Ctrl-b` `d` - detaches from tmux back to the original shell, which you can exit to terminate the container

Google `tmux` for tutorials that demonstrate many more capabilities.
