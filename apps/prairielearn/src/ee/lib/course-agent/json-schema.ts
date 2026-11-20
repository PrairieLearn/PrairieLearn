import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

/** The JSON Schema the course agent is shown. Values are serialized JSON, so an ID is a string of digits. */
export function toJsonSchema(schema: z.ZodType) {
  return z.toJSONSchema(schema, {
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema }) => {
      if (zodSchema !== IdSchema) return;
      for (const key of Object.keys(jsonSchema)) delete jsonSchema[key];
      Object.assign(jsonSchema, { type: 'string', pattern: '^\\d+$' });
    },
  });
}
