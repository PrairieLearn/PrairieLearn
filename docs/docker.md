# Docker

## Building the container

In the base `PrairieLearn` directory run:

    docker build -t prairielearn .

## Running the container

See [the installation page](installing.md).

## `docker run` primer

Here's what the various parts of the `docker run` commands mean.

The basic format is `docker run [OPTIONS] IMAGE [COMMAND]`, with the parts in
brackets being optional.

### Options

- `-it` means "run this container interactively."
- `--rm` means "delete this container when I'm done with it." Unless you have a
  reason to keep a container, you should always use this flag.
- `-p 3000:3000` means "forward port 3000 on the host to port 3000 in the container."
- `-v /path/to/course:/course` means "mount `/path/to/course` on the host as `/course` in the container."
- `--name pl` gives the container a human-friendly name.

## Useful commands

In all of these commands, `IMAGE` refers to a docker image; if you built the
image manually (with `docker build`), then you should use `prairielearn`. If
you downloaded it (following the installation guide), use
`prairielearn/prairielearn`.

Most of these should be run from the root of your course directory.

- List running containers:

```sh
docker ps
```

- Run a specific command in the container:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/course:/course IMAGE COMMAND
```

E.g.,

```sh
docker run -it --rm -p 3000:3000 -v /path/to/course:/course IMAGE ls -lah /course
```

- Start an interactive shell session:

```sh
docker run -it --rm -p 3000:3000 -v /path/to/course:/course IMAGE /bin/bash
```

- Run a command in an existing container:

```sh
docker exec -it CONTAINER_NAME COMMAND
```

E.g., to start a shell in a container started with `--name pl`:

```sh
docker exec -it pl /bin/bash
```

## Docker Compose

This section describes common applications for [Docker Compose](https://github.com/docker/compose) with PrairieLearn. See the [official Docker Compose documentation](https://docs.docker.com/compose/) for more.

### Basics

A `docker-compose.yml` file describes the services an application needs to run. In our case, we use `docker compose` to configure and run the PrairieLearn docker container locally.

To run PrairieLearn with `docker compose`, run `docker compose up`.

By default, `docker-compose.yml` won't see any local modifications you've made to PrairieLearn files. If you'd like to use Docker Compose as part of your development workflow, see the comments in `docker-compose.yml`.

### Useful Commands

To remove all containers and clean up compose artifacts, run `docker-compose down`.

Most `docker` commands map directly to `docker-compose` commands. You can use `docker-compose run pl ...` to run the container as if you were typing `docker run ...`, or `docker-compose exec pl ...` to execute a command on the running container.
