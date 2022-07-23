# Running in Production Dockerized

As the PrairieLearn source code is publicly-available, it's possible to run PrairieLearn on your own infrastructure. Running a single instance of the PrairieLearn server may be appropriate for tens or hundreds of total users, and a number of universities have done this successfully.

## Getting started

Follow the steps to [install PrairieLearn with local source code](./installingLocal.md). Then run this command in the root folder:
```sh 
docker-compose -f docker-compose-production.yml up
```
Then access PrairieLearn from port `3000`.

## Configuration

PrairieLearn can be configured by a `config.json` in the root of the repository.

- First make the file `config.json` in your root repository.
- Add the following line to `docker-compose-production.yml` under `volumes`:

```sh
- ./config.json:/PrairieLearn/config.json
```

The `config.json` file should contain appropriate overrides for the keys in [`lib/config.js`](`https://github.com/PrairieLearn/PrairieLearn/blob/master/lib/config.js`). At a minimum, you'll probably want to update the various `postgres*` options to point it at your database.

## Reverse Proxy

> A reverse proxy can be implemented using something like [Apache](https://httpd.apache.org/docs/2.4/howto/reverse_proxy.html) or [NGINX](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/).

In `config.json` to configure your domain add:

```sh
{
"serverCanonicalHost": "https://yourdomain"
}
```

## Authentication

PrairieLearn currently has 4 ways to do user authentication. Read more at [authentication](./authentication.md).

## Admin User

After setting up authentication we can elevate a user that's logged into the system to administrator status:

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

- Connect to the postgres database by running

```sh
psql postgres
```

- Check the users table by running

```sh
SELECT * FROM users;
```

Which will display a table of users in the database:
```sh
 user_id |       uid        |    uin    |   name   | lti_course_instance_id | lti_user_id | lti_context_id | institution_id | deleted_at 
---------+------------------+-----------+----------+------------------------+-------------+----------------+----------------+------------
       1 | dev@illinois.edu | 000000000 | Dev User |                        |             |                |              1 |
```

Add the desired user to the administrators table by running

```sh
INSERT INTO administrators (user_id) VALUES (user_id from users table);
```

## Productionalizing

You'll likely want a load balancer in front of PrairieLearn that's bound to your own domain or subdomain. You can configure the domain via `serverCanonicalHost` in `config.json`. If your load balancer supports health checks, you can point it to `/pl/webhooks/ping`. This route will respond with a 200 if the PrairieLearn server is healthy.

Running a single instance of the PrairieLearn server may be appropriate for tens or hundreds of total users. However, for large userbases or use cases that call for hundreds or thousands of simultaneous users, you'll likely want to scale PrairieLearn horizontally. If you're running multiple servers, you'll need to provide a [Redis cluster](https://redis.io/) and configure access to it with `redisUrl` in `config.json`. You can also enable support for chunks to deploy servers that don't need access to course Git repositories on disk; see [`lib/chunks.js`](https://github.com/PrairieLearn/PrairieLearn/blob/master/lib/chunks.js) to get a sense of how this works and how to configure it.

If you want to use [external graders](./externalGrading.md) or [workspaces](./workspaces/index.md), you'll need to provide appropriate infrastructure and config to support them. You'll likely want to run [`grader_host`](https://github.com/PrairieLearn/PrairieLearn/tree/master/grader_host) and [`workspace_host`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspace_host) on independent fleets of machines that can autoscale to handle bursts of traffic and that can automatically replace unhealthy hosts.

## Support

Due to the custom nature of self-hosted installations and the difficulty associated with operating complex software in production, we do not offer any specific recommendations or guidance around operating or scaling self-hosted installations. Over at [prairielearn.com](https://www.prairielearn.com/), we do what works best for the thousands of instructors and students who are using our hosting offering, and we'd love to work with you there once your self-hosted install becomes a burden instead of a joy.
