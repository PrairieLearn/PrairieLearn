# Running in Docker for development

This page describes the procedure to run PrairieLearn within Docker, but using a locally-installed version of the PrairieLearn source code. This is the recommended way to do PrairieLearn development. This is tested and supported on macOS, Linux, and Windows. When using Windows, you are strongly encouraged to perform the steps below inside a WSL 2 container.

!!! tip "Summary"

    ```sh
    git clone https://github.com/PrairieLearn/PrairieLearn.git
    cd PrairieLearn
    docker run -it --rm -p 3000:3000 \
      -e DEV=true -v .:/PrairieLearn \
      prairielearn/prairielearn \
      /bin/bash -c "make deps && /PrairieLearn/scripts/init.sh"
    ```

First install the Docker version of PrairieLearn as described in the [installation documentation](../installing.md).

Then, clone PrairieLearn from the main repository:

```sh
git clone https://github.com/PrairieLearn/PrairieLearn.git
```

To run without spawning a shell in the container, run:

```sh
docker run -it --rm -p 3000:3000 \
  -e DEV=true -v .:/PrairieLearn \
  prairielearn/prairielearn \
  /bin/bash -c "make deps && /PrairieLearn/scripts/init.sh"
```

For most development, you will need access to a shell in the container to run tests, linting, etc.
First, start a shell in the container with:

```sh
cd PrairieLearn
docker run -it --rm -p 3000:3000 \
  -w /PrairieLearn -v .:/PrairieLearn \
  prairielearn/prairielearn /bin/bash
```

This will launch a shell inside a Docker container running the PrairieLearn image, but using the current working directory for its code. If you'd rather run the command from somewhere other than the root of the repo, replace `.` with the path to the directory in `.:/PrairieLearn`.

To run the PrairieLearn server in development mode, use:

```sh
make deps
make dev
```

This will start the PrairieLearn server and automatically restart it when you make changes to the JavaScript code. To stop the server, press ++ctrl+c++. To exit the container after the server is stopped, press ++ctrl+d++.

To support workspaces in local development, use `make dev-all` or `make start-all` to run both PrairieLearn and a workspace server application. For these to work, you will need to modify your Docker invocation to support external graders and workspaces. More information is on the [instructor installation page](../installing.md/#support-for-external-graders-and-workspaces).

## Development

More information on the common commands and actions you do during development can be found on the [development quickstart](./quickstart.md) page.

## Updating or building the Docker image

The commands above all run PrairieLearn using local source inside the `prairielearn/prairielearn` image. This image has Python packages and other supporting files already installed. This should be periodically updated with:

```sh
docker pull prairielearn/prairielearn
```

You can also build a local copy of this image and use it to make sure you have a version that corresponds exactly to your local source:

```sh
cd /path/to/PrairieLearn
docker build -t prairielearn/prairielearn .
```

## Connecting to an existing Docker container

The previous shells were launched in their own containers. If you want to open a shell in a Docker container that is _already running_, you can find the container's name and connect to it.

- Find the name of your running PrairieLearn container by running

  ```sh
  docker ps
  ```

  which will output multiple columns of information about your running container(s). Look for the `prairielearn/prairielearn` image and copy its corresponding name. For example, the name of the PrairieLearn container in this `docker ps` output is `upbeat_roentgen`:

  ```output
  CONTAINER ID  IMAGE                      COMMAND              CREATED      STATUS      PORTS                   NAMES
  e0f522f41ea4  prairielearn/prairielearn  "/bin/sh -c /Prai…"  2 hours ago  Up 2 hours  0.0.0.0:3000->3000/tcp  upbeat_roentgen
  ```

- Open a shell in your PrairieLearn container by running

  ```sh
  docker exec -it CONTAINER_NAME /bin/bash
  ```
