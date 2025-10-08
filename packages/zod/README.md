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

### `DateFromISOString`

```ts
import { DateFromISOString } from '@prairielearn/zod';

DateFromISOString.parse('2023-01-01T12:00:00Z'); // Date
```

### `InstantFromISOString`

```ts
import { InstantFromISOString } from '@prairielearn/zod';

InstantFromISOString.parse('2023-01-01T12:00:00Z'); // Temporal.Instant
```
