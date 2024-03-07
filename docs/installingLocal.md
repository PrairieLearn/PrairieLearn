# Running in Docker with local source

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on MacOS, Linux, and Windows. When using Windows, you are strongly encouraged to perform the steps below inside a WSL 2 container.

- First install the Docker version of PrairieLearn as described in the [installation documentation](installing.md).

- Clone PrairieLearn from the main repository:

  ```sh
  git clone https://github.com/PrairieLearn/PrairieLearn.git
  ```

- Run PrairieLearn with:

  ```sh
  cd PrairieLearn
  docker run -it --rm -p 3000:3000 -w /PrairieLearn -v .:/PrairieLearn prairielearn/prairielearn /bin/bash
  ```

  This will launch a shell inside a Docker container running the PrairieLearn image, but using the current working directory for its code. If you'd rather run the command from somewhere other than the root of the repo, replace `.` with the path to the directory in `.:/PrairieLearn`.

  If you're running on an Apple Silicon Mac or another ARM-based machine, you may get an error like `no matching manifest for linux/arm64/v8 in the manifest list entries`. To resolve this, add `--platform linux/x86_64` before the image in the command (`prairielearn/prairielearn`).

  You can now run the following commands inside the container:

  ```sh
  # Install Node packages and Python dependencies, and transpile code in the `packages/` directory.
  # Repeat after switching branches, pulling new code, or editing Python dependencies in `plbase` image.
  # If editing code in `packages/`, you should also repeat either this command or `make build`.
  make deps

  # Run the PrairieLearn server in development mode.
  make dev

  # Or, run PrairieLearn like it's run in production.
  make start

  # To stop the server, press Ctrl-C.
  # To exit the container, press Ctrl-C and then Ctrl-D.
  ```

## Auto-restarting the node server

The steps above require you to manually stop and restart PrairieLearn after you have edited any JavaScript files. You can alternatively configure the server to automatically restart when changes are detected. To do this, run the PrairieLearn container as described at the start of this page and then run:

```sh
make dev
```

Alternatively, you can set the `DEV=true` environment variable while running PrairieLearn automatically:

```sh
docker run -it --rm -p 3000:3000 -e DEV=true -v .:/PrairieLearn prairielearn/prairielearn
```

## Running the test suite

The linters and tests for the JavaScript and Python code can be run with the following commands inside the container:

```sh
docker run -it --rm -p 3000:3000 -w /PrairieLearn -v .:/PrairieLearn prairielearn/prairielearn /bin/bash

# You can now run the following commands inside the container:
make lint   # or run "make lint-js" and "make lint-python" separately
make test   # or "make test-js" and "make test-python"
```

To run specific tests you first need to run `make start-support` to start the database and other services:

```sh
docker run -it --rm -p 3000:3000 -w /PrairieLearn -v .:/PrairieLearn prairielearn/prairielearn /bin/bash

# following commands are inside the container:
make start-support
cd apps/prairielearn
yarn mocha src/tests/getHomepage.test.js
```

## Working on packages

When working on something in the `packages/` directory, you'll need to rebuild the package before any changes will become visible to other packages or apps that use the package. You can build everything with `make build`, or you can run the `dev` script in a package to rebuild it automatically whenever there are changes.

```sh
# From the root of the repository:
yarn workspace @prairielearn/postgres run dev

# From a specific package directory, e.g. `packages/postgres`:
yarn dev
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
