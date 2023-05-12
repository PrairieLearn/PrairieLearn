# `@prairielearn/sentry`

Opinionated wrapper around `@sentry/node`. Currently, the only difference is that it exports an async `init` function that automatically sets the release to the current Git revision, if available.

```ts
import { init } from '@prairielearn/sentry';

await init({
  dsn: 'DSN HERE',
  environment: 'ENVIRONMENT HERE',
});
```
