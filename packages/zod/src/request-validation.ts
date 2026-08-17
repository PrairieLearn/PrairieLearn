import { type ZodType, type output } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

const REQUEST_VALIDATION_ERROR_MESSAGES = {
  body: 'Invalid request body',
  query: 'Invalid query parameters',
} as const;

function parseRequestData<Schema extends ZodType>(
  source: keyof typeof REQUEST_VALIDATION_ERROR_MESSAGES,
  data: unknown,
  schema: Schema,
): output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpStatusError(400, REQUEST_VALIDATION_ERROR_MESSAGES[source], {
      cause: result.error,
    });
  }
  return result.data;
}

export function parseRequestQuery<Schema extends ZodType>(
  req: { query: unknown },
  schema: Schema,
): output<Schema> {
  return parseRequestData('query', req.query, schema);
}

export function parseRequestBody<Schema extends ZodType>(
  req: { body: unknown },
  schema: Schema,
): output<Schema> {
  return parseRequestData('body', req.body, schema);
}
