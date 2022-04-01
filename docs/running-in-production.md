# Running in Production

As the PrairieLearn source code is publicly-available, it's possible to run PrairieLearn on your own infrastructure. Running a single instance of the PrairieLearn server may be appropriate for tens or hundreds of total users, and a number of universities have done this successfully.

## Getting started

Follow the steps to [install PrairieLearn natively](./installingNative.md), including installing dependencies. You can then run `NODE_ENV=production make start` and access PrairieLearn from port `3000`.

## Configuration

PrairieLearn can be configured by a `config.json` in the root of the repository. You can also provide a path to a config file when starting the server:

```sh
NODE_ENV=production node server.js --config /path/to/config.json
```

The `config.json` file should contain appropriate overrides for the keys in [`lib/config.js`](`https://github.com/PrairieLearn/PrairieLearn/blob/master/lib/config.js`). At a minimum, you'll probably want to update the various `postgres*` options to point it at your database.

## Productionalizing

You'll likely want a load balancer in front of PrairieLearn that's bound to your own domain or subdomain. You can configure the domain via `serverCanonicalHost` in `config.json`. If your load balancer supports health checks, you can point it to `/pl/webhooks/ping`. This route will respond with a 200 if the PrairieLearn server is healthy.

Running a single instance of the PrairieLearn server may be appropriate for tens or hundreds of total users. However, for large userbases or use cases that call for hundreds or thousands of simultaneous users, you'll likely want to scale PrairieLearn horizontally. If you're running multiple servers, you'll need to provide a [Redis cluster](https://redis.io/) and configure access to it with `redisUrl` in `config.json`. You can also enable support for chunks to deploy servers that don't need access to course Git repositories on disk; see [`lib/chunks.js`](https://github.com/PrairieLearn/PrairieLearn/blob/master/lib/chunks.js) to get a sense of how this works and how to configure it.

If you want to use [external graders](./externalGrading.md) or [workspaces](./workspaces/index.md), you'll need to provide appropriate infrastructure and config to support them. You'll likely want to run [`grader_host`](https://github.com/PrairieLearn/PrairieLearn/tree/master/grader_host) and [`workspace_host`](https://github.com/PrairieLearn/PrairieLearn/tree/master/workspace_host) on independent fleets of machines that can autoscale to handle bursts of traffic and that can automatically replace unhealthy hosts.

## Support

Due to the custom nature of self-hosted installations and the difficulty associated with operating complex software in production, we do not offer any specific recommendations or guidance around operating or scaling self-hosted installations. Over at [prairielearn.com](https://www.prairielearn.com/), we do what works best for the thousands of instructors and students who are using our hosting offering, and we'd love to work with you there once your self-hosted install becomes a burden instead of a joy.
