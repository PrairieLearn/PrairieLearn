# Using Docker Compose

## Getting started

Follow the steps to [install PrairieLearn with local source code](../installingLocal.md). Then run this command in the root folder:

```sh
docker compose -f docker-compose-production.yml up
```

Then access PrairieLearn from port `3000`.

## Running with no Modifications

If you would like to run a vanilla version of PrairieLearn with no modifications add this line to the `docker-compose-production.yml` under `build`:

```sh
dockerfile: Dockerfile-alternate
```

## Configuration

PrairieLearn can be configured by a `config.json` in the root of the repository.

- First make the file `config.json` in your root repository.
- Add the following line to `docker-compose-production.yml` under `volumes`:

```sh
- ./config.json:/PrairieLearn/config.json
```

The `config.json` file should contain appropriate overrides for the keys in [`lib/config.js`](`https://github.com/PrairieLearn/PrairieLearn/blob/master/lib/config.js`). At a minimum, you'll probably want to update the various `postgres*` options to point it at your database.

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

## Support

See here for [extra information](./setup.md#support).
