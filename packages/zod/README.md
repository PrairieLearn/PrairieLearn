# `@prairielearn/zod`

Useful Zod schemas.

## Usage

### `BooleanFromCheckboxSchema`

```ts
import { BooleanFromCheckboxSchema } from '@prairielearn/zod';

BooleanFromCheckboxSchema.parse(''); // false
BooleanFromCheckboxSchema.parse('true'); // true
BooleanFromCheckboxSchema.parse('1'); // true
BooleanFromCheckboxSchema.parse('on'); // true
```

### `zInstant`

The temporal helpers are originally from [`temporal-zod`](https://github.com/macalinao/temporal-utils/tree/master/packages/temporal-zod) and were modified to work with `@js-temporal/polyfill` instead of `temporal-polyfill`.

```ts
import { zInstant } from '@prairielearn/zod';

zInstant.parse('2023-01-01T12:00:00Z');
```

### Licensing

Only the code for the `temporal` helpers is licensed under the Apache 2.0 license.
