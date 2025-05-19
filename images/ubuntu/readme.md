# Docker Image based on Ubuntu 24.04

The Docker image `plbase` is based on `amazonlinux:2023` which is fine for building an Amazon image, but not as helpful as a guide to how to run native on Ubuntu. The goal of this Docker image is not to replace `prairielearn/prairielearn:latest` as a Docker image, but to serve as a model to show that it is possible to install PrairieLearn on Ubuntu. That is, instead of text instructions that can be out-of-date or confusing, we provide code that can be run to demonstrate the needed steps and can be tested to ensure that the steps work.

Following is a command that will build the image:

```
docker buildx build -t prairielearn:ubuntu .
```

Following is a command that will start a container:

```
docker run --name pl_ubuntu -it --rm -v /tmp:/jobs \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e HOST_JOBS_DIR=/tmp -e DEV=true -p 3000:3000 \
  prairielearn:ubuntu
```

Once connected to the container, you can start Postgres and start PrairieLearn or run tests:

```
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/postgres -l /var/postgres/logfile start"
make test
make start      # basic PrairieLearn
make start-all  # PrairieLearn with workspaces and external graders
```

You can connect to a running container:

```
docker exec -it pl_ubuntu /bin/bash
```
