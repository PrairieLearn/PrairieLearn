# @prairielearn/superjson

A modified version of [superjson-temporal](https://www.npmjs.com/package/superjson-temporal) that allows for serialization of Temporal types with the `@js-temporal/polyfill` package instead of the [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill) package.

## Usage

```typescript
import { registerSuperJSONTemporal } from '@prairielearn/superjson';
import { default as SuperJSON } from 'superjson';

registerSuperJSONTemporal(SuperJSON);
```

This will automatically add serializers/deserializers for Temporal types to SuperJSON.

## License

Apache-2.0
