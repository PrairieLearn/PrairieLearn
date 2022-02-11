# Installing with local source code

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows.

- First install the Docker version of PrairieLearn as described in the [installation documentation](installing.md).

- Clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

- Run PrairieLearn with:

```sh
docker run -it --rm -p 3000:3000 -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash

# You can now run the following commands inside the container:

# Install Node packages.
# Repeat after switching branches or pulling new code.
yarn

# Transpile code in the `packages/` directory.
# Repeat after switching branches, pulling new code, or editing JS/TS in `packages/`.
make build

# Run the PrairieLearn server.
make start

# now you can Ctrl-C and run "make start" again to restart PrairieLearn (after code edits, for example)
# or Ctrl-C to stop PL and Ctrl-D to exit the container
```

The path `/path/to/PrairieLearn` above should be replaced with the _absolute_ path to the PrairieLearn source on your computer. If you're in the root of the source directory already, you can substitute `%cd%` (on Windows cmd), `${PWD}` (on Windows PowerShell), or `$PWD` (Linux, MacOS, and WSL) for `/path/to/PrairieLearn`.

## Running the test suite

The linters and tests for the JavaScript and Python code can be run with the following commands inside the container:

```sh
docker run -it --rm -p 3000:3000 -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash

# You can now run the following commands inside the container:
make lint   # or run "make lint-js" and "make lint-python" separately
make test   # or "make test-js" and "make test-python"
```

To run specific tests you first need to run `make start-support` to start the database and other services:

```sh
docker run -it --rm -p 3000:3000 -w /PrairieLearn -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn /bin/bash

# following commands are inside the container:
make start-support
mocha tests/testGetHomepage.js
```

## Updating or building the Docker image

The commands above all run PrairieLearn using local source inside the `prairielearn/prairielearn` image. This image has Python packages and other supporting files already installed. This should be periodically updated with:

```sh
docker pull prairielearn/prairielearn
```

You can also build a local copy of this image and use it to make sure you have a version that corresponds exactly to your local source:

```sh
cd /path/to/PrairieLearn
docker build -t prairielearn/plbase images/plbase
docker build -t prairielearn/prairielearn .
```

## Auto-restarting the node server

The description at the start of this page suggests manually stopping and restarting PrairieLearn after you have edited any JavaScript files. You can alternatively use the `nodemon` package to watch for changes to code and auto-restart PrairieLearn. To do this, run the PrairieLearn container as described at the start of this page and then run:

```sh
make start-nodemon
```

Alternatively, you can set the `NODEMON=true` environment variable while running PrairieLearn automatically:

```sh
docker run -it --rm -p 3000:3000 -e NODEMON=true -v /path/to/PrairieLearn:/PrairieLearn prairielearn/prairielearn
```

## Connecting to an existing Docker container

The previous shells were launched in their own containers. If you want to open a shell in a Docker container that is _already running_, you can find the container's name and connect to it.

- Find the name of your running PrairieLearn container by running

```sh
docker ps
```

which will output multiple columns of information about your running container(s). Look for the `prairielearn/prairielearn` image and copy its corresponding name. For example, the name of the PrairieLearn container in this `docker ps` output is `upbeat_roentgen`:

```
CONTAINER ID  IMAGE                      COMMAND              CREATED      STATUS      PORTS                   NAMES
e0f522f41ea4  prairielearn/prairielearn  "/bin/sh -c /Prai…"  2 hours ago  Up 2 hours  0.0.0.0:3000->3000/tcp  upbeat_roentgen
```

- Open a shell in your PrairieLearn container by running

```sh
docker exec -it CONTAINER_NAME /bin/bash
```

## Using tmux in a container

While developing, you might need or want to run multiple programs simultaneously (e.g., querying in `psql` without killing the `node` server). Rather than repeatedly canceling and restarting programs back and forth, you can use a terminal multiplexer like `tmux` to keep them running simultaneously.

The PrairieLearn Docker images are built with `tmux` installed. If you start a container with a shell then you can first run `tmux` before running other commands.

Tmux creates virtual windows which run simultaneously (you only see one window at a time). Tmux is controlled by typing a `Ctrl-b` and then another key. The basic commands are:

- `Ctrl-b` `c` - create a new window
- `Ctrl-b` `0` - switch to window number 0 (also `Ctrl-b` `1` switches to window 1, etc.)
- `Ctrl-b` `d` - detaches from tmux back to the original shell, which you can exit to terminate the container

Google `tmux` for tutorials that demonstrate many more capabilities.
