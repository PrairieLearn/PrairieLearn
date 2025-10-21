# `@prairielearn/sentry`

Opinionated wrapper around `@sentry/core` and `@sentry/node-core`. The main modification is an async `init` function that automatically sets the release to the current Git revision, if available.

```ts
import { init } from '@prairielearn/sentry';

await init({
  dsn: 'DSN HERE',
  environment: 'ENVIRONMENT HERE',
});
```

## Why `@sentry/node-core` instead of `@sentry/node`?

`@sentry/node` ships with automatic OpenTelemetry integration. This has two main downsides for us:

- PrairieLearn applications have their own OpenTelemetry setup, which conflicts with Sentry's desire to control OpenTelemetry. In isolation, this wouldn't be a problem, as they offer configuration options to disable automatic OpenTelemetry setup. However...
- It pins OpenTelemetry instrumentation packages to specific versions. This makes it hard for us to upgrade OpenTelemetry instrumentation packages independently.
- It includes a lot of unnecessary OpenTelemetry instrumentation packages that are unused in our codebase.

By using `@sentry/node-core` instead, we retain full control over the OpenTelemetry setup and the versions of OpenTelemetry instrumentation packages we use.

See <https://github.com/getsentry/sentry-javascript/issues/15213> for slightly more historical context.
