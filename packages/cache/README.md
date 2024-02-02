# `@prairielearn/cache`

Utilities to help connect to and store information in a cache. This package _does not_ load configurations directly. Instead, configs should be passed in when the package is initialized upon loading the application. Then, the package can be used in the throughout the application to interact with the cache.

## USAGE

First, you will need to initialize the library with the cache type that you are intending to use and optionally, a redis server URL if that is the cach type being used:

```ts
import { cacheInit } from '@prairielearn/cache';
import { config } from 'lib/config.js';

await cacheInit({
  cacheType: config.cacheType,
  redisUrl: config.redisUrl,
});
```

In this example, we are using a config file that has stored the cache configurations and we are passing those in to initialize our cache.

After initializing, we can use our `cacheSet`, `cacheGet`, `cacheDel`, `cacheReset` or `cacheClose` functions to interact with the cache. Note, that `cacheSet`, `cacheGet`, and `cacheDel` have required arguments. Calling `cacheSet` will require the intended KEY, VALUE, and length of time to store the data (in milliseconds). Calling `cacheGet` or `cacheDel` will require the KEY for the intended result.

The following example will store `foo: bar` for 10 minutes:

```ts
await cacheSet('foo', 'bar', 600000);
```

The following example will use the key `foo` to retrieve the value `bar`:

```ts
await cacheGet('foo');
// returns bar
```

The following example will use the key `foo` to delete the key value pair `foo: bar`:

```ts
await cacheDel('foo');
```

Using `cacheReset` will clear the currently stored data in the cache. Using `cacheClose` will disable the currently used cache and, if using Redis, close the connection.
