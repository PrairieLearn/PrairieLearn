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

## Docker-Compose

This section describes common applications for [Docker Compose](https://github.com/docker/compose) with PrairieLearn. See the [official Docker Compose documentation](https://docs.docker.com/compose/) for more.

### Basics

A docker-compose file describes the services an application needs to run. In our case, we use `docker-compose` to configure and run the PrairieLearn docker container locally.

To run PrairieLearn with `docker-compose`, run `docker-compose up pl`. This will, in order:

- Build the PL docker image, and tag it as `prairielearn/prairielearn:local`
- Mount `./testCourse` as a volume for a test course
- Set up the container to run [external grading jobs](externalGrading.md)
- Mount the current directory as `/PrairieLearn`
- Configure the server to automatically restart when files are modified

The server will be available on port `3000`.

The equivalent `docker run` command to perform all these actions would be:

```sh
docker build -t prairielearn/prairielearn:local .
docker run -it --rm \
  -p 3000:3000 \
  -v $PWD/testCourse:/course \
  -v $HOME/pl_ag_jobs:/jobs \
  -v $PWD:/PrairieLearn \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e HOST_JOBS_DIR=$HOME/pl_ag_jobs \
  -e DEV=true \
  prairielearn/prairielearn
```

### Useful Commands

Usually, you will not have to rebuild the base image. If you do, then you can either run `docker-compose build pl` or `docker-compose up --build pl` (the later will rebuild the image, and then start the container).

To remove all containers and clean up compose artifacts, run `docker-compose down`.

Most `docker` commands map directly to `docker-compose` commands. You can use `docker-compose run pl ...` to run the container as if you were typing `docker run ...`, or `docker-compose exec pl ...` to execute a command on the running container.

## Multiple Compose Files

If you're developing locally, and want to override parts of the config, you can create your own compose file (perhaps `docker-compose.local.yml`). Then, if you type:

```sh
docker-compose -f docker-compose.yml -f docker-compose.local.yml ...
```

compose will use values from `docker-compose.local.yml` to override those from `docker-compose.yml`.

If a file `docker-compose.override.yml` exists, Docker Compose will override all configurations with that file, even if it isn't specified in the invoking command.

## Docker Hub

Docker Hub automatically (re)builds the `prairielearn/prairielearn` image
whenever a commit is pushed to `master`.

If you need to publish a local build, here's how:

### Pushing to Docker Hub

List images:

```sh
docker images
```

Tag the correct one by ID:

```sh
docker tag 7d9495d03763 prairielearn/prairielearn:latest
```

Login to Docker Hub:

```sh
docker login
```

Push the image:

```sh
docker push prairielearn/prairielearn
```

### Checking a push was successful

Delete all local versions:

```sh
docker rmi -f 7d9495d03763
```

Pull and run the new version:

```sh
docker run -it -p 3000:3000 -v ~/git/pl-tam212:/course prairielearn/prairielearn
```
