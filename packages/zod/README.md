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
