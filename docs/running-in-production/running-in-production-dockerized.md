# Using Docker Compose

## Getting started

Follow the steps to [install PrairieLearn with local source code](../installingLocal.md). Then run this command in the root folder:

```sh
docker-compose -f docker-compose-production.yml up
```

Then access PrairieLearn from port `3000`.

## Configuration

If you would like to run a vanilla version of PrairieLearn with no modifications add this line to the `docker-compose-production.yml` under `build`:

```sh
dockerfile: Dockerfile-alternate
```

Like so:

```sh
version: '3.8'
services:
  pl:
    build:
      context: .
      dockerfile: Dockerfile-alternate
    image: prairielearn/prairielearn:local
```

PrairieLearn can be configured by a `config.json` in the root of the repository.

- First make the file `config.json` in your root repository.
- Add the following line to `docker-compose-production.yml` under `volumes`:

```sh
- ./config.json:/PrairieLearn/config.json
```

Like so:

```sh
version: '3.8'
services:
  pl:
    build:
      context: .
    image: prairielearn/prairielearn:local
    ports:
      - 3000:3000
    volumes:
      - ./config.json:/PrairieLearn/config.json
```

The `config.json` file should contain appropriate overrides for the keys in [`lib/config.js`](`https://github.com/PrairieLearn/PrairieLearn/blob/master/lib/config.js`). At a minimum, you'll probably want to update the various `postgres*` options to point it at your database.

## Reverse Proxy

For implementing a reverse proxy read more [here](./running-in-production.md#reverse-proxy).

## Authentication

PrairieLearn currently has 4 ways to do user authentication. Read more at [authentication](./authentication.md).

## Admin User

You will need to be an [Admin User](./admin-user.md) to setup PrairieLearn.

## Support

See here for [extra information](./running-in-production.md#support).
