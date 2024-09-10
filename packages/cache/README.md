# `@prairielearn/cache`

Utilities to help connect to and store information in a cache. This package _does not_ load configurations directly. Instead, configs should be passed in when the package is initialized upon loading the application. Then, the package can be used in the throughout the application to interact with the cache.

## Usage

First, you will need to initialize the library with the cache type that you are intending to use, a prefix that will be the start of all of your cache keys, and optionally, a Redis server URL if that is the cache type being used:

```ts
import { cache } from '@prairielearn/cache';

await cache.init({
  type: 'redis',
  keyPrefix: 'my-app:',
  redisUrl: 'redis://localhost:6379/',
});
```

Alternatively, you can create new instances of the `Cache` class instead of using the global `cache` object:

```ts
import { Cache } from '@prairielearn/cache';

const myCache = new Cache();

await myCache.init({
  type: 'redis',
  keyPrefix: 'my-app:',
  redisUrl: 'redis://localhost:6379/',
});
```

After initializing, you can use `set`, `get`, `del`, `reset` or `close` functions to interact with the cache. Note that `set`, `get`, and `del` have required arguments. Calling `set` will require the intended KEY, VALUE, and length of time to store the data (in milliseconds). Calling `get` or `del` will require the KEY for the intended result.

The following example will store `foo: bar` for 10 minutes:

```ts
await cache.set('foo', 'bar', 600000);
```

The following example will use the key `foo` to retrieve the value `bar`:

```ts
await cache.get('foo');
// returns bar
```

The following example will use the key `foo` to delete the key value pair `foo: bar`:

```ts
await cache.del('foo');
```

Using `reset()` will clear the currently stored data in the cache. Using `close()` will disable the currently used cache and, if using Redis, close the connection.
