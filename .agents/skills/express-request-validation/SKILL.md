---
name: express-request-validation
description: Conventions for validating PrairieLearn Express request parameters, query strings, bodies, and `__action` forms with Zod.
---

## Request boundaries

- Define request schemas at module scope unless they genuinely depend on request-time values. Prefer a static structural schema followed by a semantic check over constructing a schema per request.
- Parse every request source a handler consumes before database queries or other work. After parsing, use only the parsed values; do not read the corresponding `req.params`, `req.query`, or `req.body` values again.
- Treat parsed request objects as boundary data, not as parameter bags. Pass explicit fields to database queries, model functions, and other downstream APIs instead of passing `params`, `query`, or `body` wholesale; this keeps each callsite's contract visible and avoids unused-parameter failures when request schemas grow.
- Use `parseRequest` when validating multiple sources together. Use `parseRequestParams`, `parseRequestQuery`, or `parseRequestBody` when validating only one source.
- Express cannot verify that a params schema matches the router path. Check the parent mount path as well as the local route and ensure every `ParamsSchema` key matches an actual `:parameter`.

## Schema naming

- Name schemas at the boundary where they are consumed: `PostBodySchema` for `parseRequestBody` and `PostRequestSchemas` for `parseRequest` in a POST handler.
- Inline a source schema inside `PostRequestSchemas` when it is used only there. Extract `ParamsSchema`, `QuerySchema`, or `PostBodySchema` when the same schema is reused by another handler, parser, inferred type, or composed schema.
- The combined request schema object is plural because it contains schemas keyed by source.
- If a file has multiple handlers that would make these names ambiguous, add a concise operation prefix, such as `CreatePostBodySchema` or `ArchivePostRequestSchemas`.
- For a discriminated union, action-specific branch schemas may use names such as `InviteUidsBodySchema`, while the complete union remains `PostBodySchema`.

## `__action` forms

- Use `__action` only when one POST endpoint genuinely multiplexes multiple operations. A single-operation endpoint should use a plain body schema and a submit button without `name="__action"`.
- Model a multi-operation body as a top-level `z.discriminatedUnion('__action', ...)`, parse it before dispatch, and switch on the parsed `body.__action`.
- An unrecognized top-level `__action` discriminator is automatically reported as `unknown __action: <value>` by the request-validation helpers. Other body validation failures remain `Invalid request body`.

## Example

```ts
const ParamsSchema = z.object({ course_id: IdSchema });
const PostRequestSchemas = {
  params: ParamsSchema,
  body: z.object({ name: z.string().min(1) }),
};

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { params, body } = parseRequest(req, PostRequestSchemas);
    await updateCourse(params.course_id, body.name);
    res.redirect(req.originalUrl);
  }),
);
```
