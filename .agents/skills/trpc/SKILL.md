---
name: trpc
description: Conventions for writing tRPC routers and procedures.
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

### Client-side queries and mutations

- Use `trpc.subrouter.procedure.queryOptions()` with `useQuery()` for queries. Do **not** manually construct `{ queryKey, queryFn }` objects — the generated `queryOptions()` provides type-safe keys and avoids stale cache issues.
- Use `trpc.subrouter.procedure.mutationOptions()` with `useMutation()` for mutations.
- Access the `trpc` proxy via the scope's `useTRPC()` hook from `context.ts`.

### Client-side CSRF flow

The CSRF token is generated server-side with `generatePrefixCsrfToken` using the scope's URL helper from `lib/client/url.ts`, passed as a prop to the hydrated component, and sent by the tRPC client as an `X-CSRF-Token` header. The Express CSRF middleware validates it before the request reaches the tRPC router.

## Errors

- **Default to plain `TRPCError`**. Use `throwAppError` only when the client needs extra fields beyond `message` (e.g. `jobSequenceId` to link to logs) or must branch on the code. A code that the client just renders as `message` is indistinguishable from `UNKNOWN` — don't add it.
- **Every subrouter exports an error interface enumerating each procedure**, with `never` for procedures that have no typed errors:
  ```ts
  export interface AssessmentGroupsError {
    AddGroup: never;
    EnableGroupWork: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  }
  ```
  Don't use `Record<string, never>` or empty `interface XError {}`.
- **`message: string` is added automatically** by `throwAppError` and `getAppError` — only declare procedure-specific fields.
- **Client uses `getAppError<XError['Procedure']>(mutation.error)`** — procedure-keyed even when the entry is `never`. Never read raw mutation/query errors.
- **Render with `<AppErrorAlert>` or `renderAppError`**, not `{appError.message}` directly. The exhaustive renderer map makes it a compile error to forget a variant or silently drop fields like `jobSequenceId`:
  ```tsx
  <AppErrorAlert
    error={copyError}
    onDismiss={() => copyMutation.reset()}
    render={{
      SYNC_JOB_FAILED: ({ message, jobSequenceId }) => (
        <>
          {message} <a href={`${urlPrefix}/jobSequence/${jobSequenceId}`}>View job logs</a>
        </>
      ),
      UNKNOWN: ({ message }) => message,
    }}
  />
  ```
  Use `renderAppError(error, {...})` when you need a `ReactNode` to pass elsewhere (e.g. `StickySaveBar`'s `alert.message`).
- See `pages/instructorStudentsLabels/components/LabelModifyModal.tsx` (typed) and `pages/administratorCourses/administratorCourses.html.tsx` (`never`-keyed) for examples.

## Testing

tRPC procedures are tested as integration tests via HTTP. See `tests/instructorStudentsLabels.test.ts` for the pattern: create a client with `generatePrefixCsrfToken` + the scope's `create*TrpcClient`, call procedures directly, assert with `TRPCClientError` for error cases.
