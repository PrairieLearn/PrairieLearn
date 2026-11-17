# `@prairielearn/zod`

Useful Zod schemas.

## Usage

### Express request validation

Use `parseRequest` to validate any combination of Express path parameters, query parameters, and request body. Request schemas that do not depend on request-time values should be defined at module scope so their Zod instances are reused.

```ts
import { z } from 'zod';

import { IdSchema, parseRequest } from '@prairielearn/zod';

const PostRequestSchemas = {
  params: z.object({ course_id: IdSchema }),
  body: z.discriminatedUnion('__action', [
    z.object({
      __action: z.literal('rename'),
      name: z.string().min(1),
    }),
    z.object({ __action: z.literal('delete') }),
  ]),
};

const { params, body } = parseRequest(req, PostRequestSchemas);
```

Validation failures throw a `400` `HttpStatusError` with a source-specific message. An unrecognized discriminator in a top-level `z.discriminatedUnion('__action', ...)` body schema is reported as `unknown __action: <value>`; other body failures are reported as `Invalid request body`.

Use `parseRequestParams`, `parseRequestQuery`, or `parseRequestBody` when validating a single request data source.

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
