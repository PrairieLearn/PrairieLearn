# Using Docker Compose

## Getting started

Follow the steps to [install PrairieLearn with local source code](../installingLocal.md). Then run this command in the root folder:

```sh
docker compose -f docker-compose-production.yml up
```

Then access PrairieLearn from port `3000`.

## Configuration

PrairieLearn can be configured by a `config.json` in the root of the repository.

- First make the file `config.json` in your root repository.
- Add the following line to `docker-compose-production.yml` under `services.pl.volumes`:

  ```sh
  - ./config.json:/PrairieLearn/config.json
  ```

The `config.json` file should contain appropriate overrides for the keys in [`lib/config.js`](`https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/lib/config.js`). At a minimum, you'll probably want to update the various `postgres*` options to point it at your database.

## Reverse Proxy

For implementing a reverse proxy read more [here](./setup.md#reverse-proxy).

## Authentication

PrairieLearn currently has 4 ways to do user authentication. Read more at [authentication](./authentication.md).

## Admin User

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

Then follow along at [Admin User](./admin-user.md) to setup PrairieLearn.

## Adding SSH Keys

To get courses through GitHub we will need to configure the SSH keys in the container. Every time the container is destroyed, the keys are lost, so we need to make the keys the same as the Host.

Run the command on the host system

```sh
ssh-keygen
```

Which will generate a new key. Save this somewhere you will remember. Next you must bind mount these keys into the Docker container. In `docker-compose-production.yml` under `volumes` add

```sh
- /host/path/to/.ssh:/root/.ssh
```

To view the public key run the command

```sh
cat ~/.ssh/id_rsa.pub
```

Next to add the SSH key on GitHub go to [SSH keys](https://github.com/settings/ssh/new) under `profile settings`. Add a title, then copy the public key into the `Key` field.

## Adding courses

Adding courses is done through a GitHub repository. It is recommended to setup an organization under one user to which you can add all courses.

To make sure the courses remain if the Docker container goes down
we must bind mount the folder in which courses are stored to the host machine, in `docker-compose-production.yml` under `volumes` add

```sh
- host/place/to/store/courses/:/container_courses_dir/
```

Once you have a course created, on PrairieLearn go to `Admin` then scroll down to `Courses`. Here click `Add Course`. Add the relevant information, take extra care that under `Path` you use the bind mounted path.

For example:

`Path: /container_courses_dir/mycourse`

To clone the course into PrairieLearn:

- Go to the course GitHub repository you wish to put on PrairieLearn, click `code` and then `SSH`.
- Copy the SSH URL and paste it under the `Repository` section. Go back to the homepage and you should see the course there.
- Click on the course, then `Sync`.
- Click on `Pull from remote git repository` which will then clone all the files into the specified directory.

## Support

See here for [extra information](./setup.md#support).
