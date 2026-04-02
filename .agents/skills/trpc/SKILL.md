---
name: trpc
description: Conventions for writing tRPC routers and procedures in PrairieLearn.
---

## Quick reference

- **Adding a procedure to an existing feature?** Find the subrouter file in the appropriate scope directory, add the procedure. No other files need changes.
- **Adding a new subrouter to an existing scope?** Create a new file in the scope directory, export a router, register it in that scope's `trpc.ts`.
- **Adding a new scope?** Copy an existing scope directory (e.g. `trpc/assessment/`), adjust the `ResLocalsForPage` type, context fields, URL helper in `lib/client/url.ts`, and mount path in `server.ts`.
- **Wiring up client-side React?** Follow the pattern in any page that already uses tRPC (e.g. `pages/instructorInstanceAdminSettings/`). Key pieces: `generatePrefixCsrfToken` from `@prairielearn/signed-token` server-side, scope's `client.ts` + `context.ts` + `QueryClientProviderDebug` client-side.
- **Returning typed errors?** See [Typed errors](#typed-errors).

## Authorization scopes

tRPC routers are mounted per authorization scope, not per page. Each scope has its own directory under `apps/prairielearn/src/trpc/` and is mounted behind the corresponding Express authorization middleware chain.

| Scope               | Directory                  | Mount path                                           | `ResLocalsForPage` type            |
| ------------------- | -------------------------- | ---------------------------------------------------- | ---------------------------------- |
| administrator       | `trpc/administrator/`      | `/pl/administrator/trpc`                             | `'plain'`                          |
| course              | (create when needed)       | `/pl/course/:course_id/trpc`                         | `'course'`                         |
| course instance     | `trpc/courseInstance/`     | `/pl/course_instance/:id/instructor/trpc`            | `'course-instance'`                |
| assessment          | `trpc/assessment/`         | `.../assessment/:assessment_id/trpc`                 | `'assessment'`                     |
| assessment question | `trpc/assessmentQuestion/` | `.../assessment/:aid/assessment_question/:aqid/trpc` | `'instructor-assessment-question'` |
| assessment instance | (create when needed)       | `.../assessment_instance/:ai_id/trpc`                | `'assessment-instance'`            |
| instance question   | (create when needed)       | `.../instance_question/:iq_id/trpc`                  | `'instance-question'`              |

Do **not** create per-page tRPC routers.

## Main vs. chunk server routing

Some procedures execute question code (via `questionServers.getModule().render()`) and must run on **chunk servers**, which have the question files available. The ALB routes requests based on URL path:

- `.../trpc` → main servers (database-only procedures)
- `.../trpc-chunk` → chunk servers (question code execution)

When a scope has both types of procedures, split the subrouter into two exports (e.g., `manualGradingMainRouter` and `manualGradingChunkRouter`). In the scope's `trpc.ts`, create separate Express middlewares for each and a combined type via `t.mergeRouters` for the client:

```ts
const combined = t.router({
  manualGrading: t.mergeRouters(manualGradingMainRouter, manualGradingChunkRouter),
});
export type AssessmentQuestionRouter = typeof combined;
```

On the client, use `splitLink` from `@trpc/client` with an explicit set of chunk procedure paths (`CHUNK_PROCEDURE_PATHS` in `client.ts`). Keep this set in sync with the chunk router definition.

A single multi-prefix CSRF token covers both endpoints — use `generatePrefixCsrfToken({ urls: [trpcUrl, trpcChunkUrl], ... })` instead of `{ url }`. This avoids threading two tokens through the component tree.

See `trpc/assessmentQuestion/` for the reference implementation.

## File structure

Every scope directory contains: `init.ts`, `trpc.ts`, `client.ts`, `context.ts`, plus one `*.ts` file per subrouter and optional `*.sql` files for scope-specific queries. All routers use `superjson` as the transformer in both `init.ts` and `client.ts`.

See any existing scope (e.g. `trpc/assessment/`) for the exact boilerplate. The files follow a mechanical pattern — `init.ts` creates the tRPC instance and authorization middleware, `trpc.ts` composes subrouters and exports Express middleware via `createExpressMiddleware`, `client.ts` creates the HTTP client with CSRF headers, `context.ts` exports `TRPCProvider`/`useTRPC` via `createTRPCContext`.

## Conventions

### Naming

- Procedure names describe the action: `list`, `upsert`, `destroy` — not `listWidgets` or `deleteMutation`.
- Variable names may use a `Mutation`/`Procedure` suffix (e.g. `const setModeMutation = t.procedure...`), but the router key must not: `setMode: setModeMutation`.
- Subrouter exports: `{feature}Router` (e.g. `widgetsRouter`). Router keys: camelCase (`widgets`).

### Authorization

- Permission middleware (`requireCourseInstancePermissionView`, etc.) is defined in `init.ts` and chained with `.use()`.
- Feature flag middleware (checking `features.enabled(...)`) goes in the subrouter file, not `init.ts`. See `trpc/assessment/access-control.ts` for an example.
- Each scope's `createContext` includes the full `locals` object alongside extracted fields as an escape hatch.

### Returning data

- Use role-scoped schemas from `lib/client/safe-db-types.ts` (e.g. `StaffStudentLabelSchema`). Always `.parse()` records through the schema before returning.
- Use existing model functions from `models/` instead of one-off SQL.

### Client-side CSRF flow

The CSRF token is generated server-side with `generatePrefixCsrfToken` using the scope's URL helper from `lib/client/url.ts`, passed as a prop to the hydrated component, and sent by the tRPC client as an `X-CSRF-Token` header. The Express CSRF middleware validates it before the request reaches the tRPC router.

## Errors

- **Default to plain `TRPCError`** with a human-readable message. Use `throwAppError` only when the client needs structured metadata (extra fields beyond `message`) or must take structurally different actions per error code. If the error message is static and displayed as-is, a plain `TRPCError` is sufficient — reserve app errors for cases where the client needs dynamic, structured data (e.g., a job sequence ID to link to).
- **Every subrouter** exports an error interface (empty if no typed errors). See `trpc/courseInstance/student-labels.ts` (typed) and `trpc/administrator/courses.ts` (empty).
- **`message: string` is automatically included** by `throwAppError` and `getAppError` — do not declare it in error type definitions. Only declare procedure-specific fields (e.g., `jobSequenceId`).
- **Client must always** use `getAppError<ErrorType>(mutation.error)` — never access raw errors directly. Always handle the `'UNKNOWN'` fallback code (for untyped errors). Never pass raw mutation/query errors as props; pass the resolved `AppError<T>` instead.
- See `pages/instructorStudentsLabels/components/LabelModifyModal.tsx` (typed client) and `pages/administratorCourses/administratorCourses.html.tsx` (plain client) for examples.

## Testing

tRPC procedures are tested as integration tests via HTTP. See `tests/instructorStudentsLabels.test.ts` for the pattern: create a client with `generatePrefixCsrfToken` + the scope's `create*TrpcClient`, call procedures directly, assert with `TRPCClientError` for error cases.
