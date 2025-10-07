# @prairielearn/superjson

Various utilities for working with SuperJSON.

## Temporal Types

```typescript
import { registerSuperJSONTemporal } from '@prairielearn/superjson';
import superjson from 'superjson';

registerSuperJSONTemporal(superjson);
```

This will automatically add serializers/deserializers for Temporal types to SuperJSON. Similar to [superjson-temporal](https://www.npmjs.com/package/superjson-temporal) but using the `@js-temporal/polyfill` package instead of the [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill) package.

## License

Apache-2.0
