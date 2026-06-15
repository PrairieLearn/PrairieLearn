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

### `DatetimeLocalStringSchema`

```ts
import { DatetimeLocalStringSchema } from '@prairielearn/zod';

DatetimeLocalStringSchema.parse('2024-01-15T14:30'); // '2024-01-15T14:30:00'
DatetimeLocalStringSchema.parse('2024-01-15T14:30:45'); // '2024-01-15T14:30:45'
```

### `UniqueUidsFromStringSchema`

```ts
import { UniqueUidsFromStringSchema } from '@prairielearn/zod';

const schema = UniqueUidsFromStringSchema();
schema.parse('user1@example.com, user2@example.com'); // ['user1@example.com', 'user2@example.com']
schema.parse('user@example.com user@example.com'); // ['user@example.com'] (deduplicated)
```
