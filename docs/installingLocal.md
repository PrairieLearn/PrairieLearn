
# Installing with local source code

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows.

* First install the Docker version of PrairieLearn as described in the [installation documentation](installing.md).

* Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

* Run PrairieLearn with:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash

# following commands are inside the container:
cd /PrairieLearn
npm ci                   # install packages, repeat this after switching branches or pulling new code
docker/start_support.sh  # start the DB, cache, etc.
make start               # run PrairieLearn itself

# now you can Ctrl-C and run "make start" again to restart PrairieLearn (after code edits, for example)
# or Ctrl-C to stop PL and Ctrl-D to exit the container
```

The path `/path/to/PrairieLearn` above should be replaced with the *absolute* path to the PrairieLearn source on your computer.  If you're in the root of the source directory already, you can substitute `%cd%` (on Windows cmd), `${PWD}` (on Windows PowerShell), or `$PWD` (Linux, MacOS, and WSL) for `/path/to/PrairieLearn`.


## Running the test suite

The linters and tests for the Python and JavaScript code can be run with the following commands in a shell instance:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash

# following commands are inside the container:
cd /PrairieLearn
docker/start_support.sh
make lint-js
make lint-python
make test-js
make test-python
```


## Updating or building the Docker image

The commands above all run PrairieLearn using local source inside the `prairielearn/prairielearn` image. This image has Python packages and other supporting files already installed. This should be periodically updated with:

```sh
docker pull prairielearn/prairielearn
```

You can also build a local copy of this image and use it to make sure you have a version that corresponds exactly to your local source:

```
cd /path/to/PrairieLearn
docker build -t local_prairielearn .

# now use it with:
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn local_prairielearn /bin/bash
```

Above we are using the `local_prairielearn` image in place of the pre-built `prairielearn/prairielearn` image.


## Running a specific branch in a pre-built container

By default, the commands above will run PrairieLearn from the branch that is currently checked out in the directory `/path/to/PrairieLearn`. So, to run a different branch, just use commands like `git checkout BRANCH_NAME` or equivalent.

It is also possible to run a branch other than `master` without cloning or checking out the code for that branch, as long as the branch has been pushed to GitHub.  If you would like to run a different branch (to test it, for example), the branch name can be appended to the end of the image name as such:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn:BRANCH_NAME
```

Note that any forward slashes (`/`) in the branch name will be need to be converted to underscores (`_`). Also note that docker does not pull branch changes by default, so you are encouraged to update the local docker cached image by using this command before starting the container above:

```sh
docker pull prairielearn/prairielearn:BRANCH_NAME
docker run -it --rm -p 3000:3000 prairielearn/prairielearn:BRANCH_NAME
```


## Running commands in Docker

If needed, you can run the container with a different command:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn COMMAND
```

This can be used to, e.g., run scripts distributed with PrairieLearn by opening a bash shell:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash
```

You can also run only package installation with:

```sh
docker run --rm -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /usr/local/bin/npm ci
```


## Auto-restarting the node server

The description at the start of this page suggests manually stopping and restarting PrairieLearn after you have edited any JavaScript files. You can alternatively use the `nodemon` package to watch for changes to code and auto-restart PrairieLearn. Two different ways to do this are:

* Run PrairieLearn as described at the start of this page, but replace `make start` with `make start-nodemon`.

* Run PrairieLearn automatically in the container and pass the `-e NODEMON=true` environment variable:

```sh
docker run -it --rm -p 3000:3000 -e NODEMON=true -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn
```


## Connecting to an existing Docker container

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


## Using tmux in a container

While developing, you might need or want to run multiple programs simultaneously (e.g., querying in `psql` without killing the `node` server). Rather than repeatedly canceling and restarting programs back and forth, you can use a terminal multiplexer like `tmux` to keep them running simultaneously.

The PrairieLearn Docker images are built with `tmux` installed. If you start a container with a shell then you can first run `tmux` before running other commands.

Tmux creates virtual windows which run simultaneously (you only see one window at a time). Tmux is controlled by typing a `Ctrl-b` and then another key. The basic commands are:

* `Ctrl-b` `c` - create a new window
* `Ctrl-b` `0` - switch to window number 0 (also `Ctrl-b` `1` switches to window 1, etc.)
* `Ctrl-b` `d` - detaches from tmux back to the original shell, which you can exit to terminate the container

Google `tmux` for tutorials that demonstrate many more capabilities.
