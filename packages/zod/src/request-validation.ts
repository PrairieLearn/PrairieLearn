import { type ZodError, type ZodType, type output } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

const REQUEST_VALIDATION_ERROR_MESSAGES = {
  body: 'Invalid request body',
  params: 'Invalid path parameters',
  query: 'Invalid query parameters',
} as const;

type RequestSource = keyof typeof REQUEST_VALIDATION_ERROR_MESSAGES;
type RequestSchemas = Partial<Record<RequestSource, ZodType>>;
type ParsedRequest<Schemas extends RequestSchemas> = {
  [Source in keyof Schemas]: output<Extract<Schemas[Source], ZodType>>;
};
type ExactRequestSchemas<Schemas extends RequestSchemas> = Schemas &
  Record<Exclude<keyof Schemas, RequestSource>, never>;

function getRequestValidationErrorMessage(
  source: RequestSource,
  data: unknown,
  error: ZodError,
): string {
  if (source === 'body') {
    for (const issue of error.issues) {
      // Keep PrairieLearn's established `unknown __action` response while leaving
      // other body validation failures generic.
      if (
        issue.code === 'invalid_union' &&
        issue.discriminator === '__action' &&
        issue.path.length === 1 &&
        issue.path[0] === issue.discriminator
      ) {
        const value =
          typeof data === 'object' && data !== null
            ? Reflect.get(data, issue.discriminator)
            : undefined;
        return `unknown ${issue.discriminator}: ${String(value)}`;
      }
    }
  }

  return REQUEST_VALIDATION_ERROR_MESSAGES[source];
}

function parseRequestData<Schema extends ZodType>(
  source: RequestSource,
  data: unknown,
  schema: Schema,
): output<Schema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpStatusError(400, getRequestValidationErrorMessage(source, data, result.error), {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * Parses each request data source for which a schema is provided.
 *
 * An unrecognized discriminator in a top-level `__action` body union is reported
 * as `unknown __action: <value>`.
 */
export function parseRequest<Schemas extends RequestSchemas>(
  req: Record<RequestSource, unknown>,
  schemas: ExactRequestSchemas<Schemas>,
): ParsedRequest<Schemas> {
  const result: Partial<Record<RequestSource, unknown>> = {};

  for (const source of ['params', 'query', 'body'] as const) {
    const schema = schemas[source];
    if (schema !== undefined) {
      result[source] = parseRequestData(source, req[source], schema);
    }
  }

  return result as ParsedRequest<Schemas>;
}

/** Parses and validates an Express request's query parameters. */
export function parseRequestQuery<Schema extends ZodType>(
  req: { query: unknown },
  schema: Schema,
): output<Schema> {
  return parseRequestData('query', req.query, schema);
}

/** Parses and validates an Express request's path parameters. */
export function parseRequestParams<Schema extends ZodType>(
  req: { params: unknown },
  schema: Schema,
): output<Schema> {
  return parseRequestData('params', req.params, schema);
}

/**
 * Parses and validates an Express request body.
 *
 * An unrecognized discriminator in a top-level `__action` union is reported as
 * `unknown __action: <value>`.
 */
export function parseRequestBody<Schema extends ZodType>(
  req: { body: unknown },
  schema: Schema,
): output<Schema> {
  return parseRequestData('body', req.body, schema);
}
