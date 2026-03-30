---
name: trpc
description: Conventions for writing tRPC routers and procedures in PrairieLearn.
---

## Authorization scopes

tRPC routers are mounted per authorization scope, not per page. Each scope has its own directory under `apps/prairielearn/src/trpc/` and is mounted behind the corresponding Express authorization middleware chain. Only scopes with active subrouters exist as directories.

| Scope               | Directory                  | Mount path                                           | `ResLocalsForPage` type            | Express middleware                                             |
| ------------------- | -------------------------- | ---------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| administrator       | `trpc/administrator/`      | `/pl/administrator/trpc`                             | `'plain'`                          | `authzIsAdministrator`                                         |
| course              | (create when needed)       | `/pl/course/:course_id/trpc`                         | `'course'`                         | `authzCourseOrInstance`, `authzHasCoursePreview`               |
| course instance     | `trpc/courseInstance/`     | `/pl/course_instance/:id/instructor/trpc`            | `'course-instance'`                | `authzCourseOrInstance`, `authzHasCoursePreviewOrInstanceView` |
| assessment          | `trpc/assessment/`         | `.../assessment/:assessment_id/trpc`                 | `'assessment'`                     | `selectAndAuthzAssessment`                                     |
| assessment question | `trpc/assessmentQuestion/` | `.../assessment/:aid/assessment_question/:aqid/trpc` | `'instructor-assessment-question'` | `selectAndAuthzAssessmentQuestion`                             |
| assessment instance | (create when needed)       | `.../assessment_instance/:ai_id/trpc`                | `'assessment-instance'`            | `selectAndAuthzAssessmentInstance`                             |
| instance question   | (create when needed)       | `.../instance_question/:iq_id/trpc`                  | `'instance-question'`              | `selectAndAuthzInstanceQuestion`                               |

Do **not** create per-page tRPC routers. If you need a new procedure, add it to the router for the appropriate scope.

tRPC scope URLs are constructed using helpers in `lib/client/url.ts` (e.g. `getAssessmentTrpcUrl`, `getCourseInstanceTrpcUrl`). Use these in both server-side CSRF token generation and client-side URL construction.

## File structure

Every scope directory contains the same set of files:

| File         | Purpose                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| `init.ts`    | `initTRPC` setup with `appErrorFormatter`, `createContext`, authorization middleware |
| `trpc.ts`    | Combines subrouters into the scope's root router, exports the Express middleware     |
| `client.ts`  | `createTRPCClient` factory for client-side use                                       |
| `context.ts` | `createTRPCContext` for `@trpc/tanstack-react-query`                                 |
| `*.ts`       | One file per subrouter (e.g. `student-labels.ts`, `courses.ts`)                      |

## Writing a subrouter

Each subrouter lives in its own file and exports a single router. Procedures are defined as module-level constants and composed into the router at the bottom of the file.

```ts
// trpc/courseInstance/widgets.ts
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffWidgetSchema } from '../../lib/client/safe-db-types.js';
import { selectWidgetsInCourseInstance } from '../../models/widget.js';

import { requireCourseInstancePermissionView, t } from './init.js';

const list = t.procedure
  .use(requireCourseInstancePermissionView)
  .output(z.object({ widgets: z.array(StaffWidgetSchema) }))
  .query(async (opts) => {
    const widgets = await selectWidgetsInCourseInstance(opts.ctx.course_instance);
    return { widgets: widgets.map((w) => StaffWidgetSchema.parse(w)) };
  });

const update = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(z.object({ widgetId: IdSchema, name: z.string().min(1) }))
  .mutation(async (opts) => {
    // ...
  });

export const widgetsRouter = t.router({
  list,
  update,
});
```

Then register the subrouter in `trpc.ts`:

```ts
export const courseInstanceRouter = t.router({
  studentLabels: studentLabelsRouter,
  widgets: widgetsRouter,
});
```

### Naming conventions

- Procedure names describe the action without redundant prefixes: `list`, `upsert`, `destroy`, `checkUids` -- not `listWidgets`, `mutateWidget`, `deleteWidgetMutation`.
- Do not include `mutation` or `query` in the procedure name; the procedure type (`.query()` vs `.mutation()`) already conveys this.
- Subrouter exports use the pattern `{feature}Router` (e.g. `widgetsRouter`, `studentLabelsRouter`).
- The key in the parent router uses camelCase matching the feature: `widgets`, `studentLabels`.

## Key patterns

### Context and authorization

`createContext` in `init.ts` extracts typed data from `res.locals` using the scope's `ResLocalsForPage` type. Authorization middleware (e.g. `requireCourseInstancePermissionView`) is defined in `init.ts` and chained onto procedures with `.use()`.

```ts
const list = t.procedure.use(requireCourseInstancePermissionView).query(async (opts) => {
  // opts.ctx has course, course_instance, authz_data, locals
});
```

Multiple middleware can be chained for fine-grained checks:

```ts
const upsert = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireCourseInstancePermissionEdit)
  .mutation(async (opts) => {
    /* ... */
  });
```

### Input and output schemas

Use Zod schemas for both `.input()` and `.output()`. Use `IdSchema` from `@prairielearn/zod` for database IDs.

### safe-db-types

When returning database records to the client, use the role-scoped schemas from `lib/client/safe-db-types.ts` (e.g. `StaffWidgetSchema`, `AdminCourseSchema`). Parse records through the schema before returning them:

```ts
return { labels: labels.map((l) => StaffStudentLabelSchema.parse(l)) };
```

### Model functions

Use existing model functions from `models/` instead of writing one-off SQL. Pass typed context objects (e.g. `courseInstance: opts.ctx.course_instance`).

### App errors

Typed application-level errors are defined in `trpc/app-errors.ts`. This file contains:

- Error interfaces grouped by scope (e.g. `StudentLabelErrors`)
- A combined `AppErrorMap` that registers all error interfaces
- `appErrorFormatter` -- the reusable error formatter used in every scope's `init.ts`
- The `AppError` class and `throwAppError` helper
- Client-side helper types (`AppErrorPaths`, `AppErrorForPath`)

Every scope's `init.ts` must include `errorFormatter: appErrorFormatter` in the `initTRPC.create()` call.

To add errors for a new subrouter:

1. Define the error interface in `trpc/app-errors.ts`:

```ts
export interface WidgetErrors {
  update: { code: 'NAME_TAKEN'; name: string };
}
```

2. Register it in `AppErrorMap`:

```ts
export interface AppErrorMap {
  studentLabels: StudentLabelErrors;
  widgets: WidgetErrors;
}
```

3. Throw typed errors in procedures:

```ts
import { type WidgetErrors, throwAppError } from '../app-errors.js';

throwAppError<WidgetErrors>({ code: 'NAME_TAKEN', name });
```

The client can then narrow on the error using `getAppError` from `lib/client/errors.ts`.

### Client-side usage with @trpc/tanstack-react-query

Each scope provides a React context via `context.ts` that exports `TRPCProvider`, `useTRPC`, and optionally `useTRPCClient`. Pages re-export these from a local `utils/trpc-context.ts` file.

Setup pattern in a hydrated component:

```tsx
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

// Outer component: create client and wrap with providers
export function MyPage({ trpcCsrfToken, courseInstance, assessment }: Props) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
    }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <MyPageInner />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

// Inner component: use hooks
function MyPageInner() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.mySubrouter.list.queryOptions());
  const mutation = useMutation(trpc.mySubrouter.update.mutationOptions());
}
```

The CSRF token is generated server-side using scope-level URL helpers from `lib/client/url.ts`:

```ts
const trpcCsrfToken = generatePrefixCsrfToken(
  {
    url: getAssessmentTrpcUrl({
      courseInstanceId: assessment.course_instance_id,
      assessmentId: assessment.id,
    }),
    authn_user_id: res.locals.authn_user.id,
  },
  config.secretKey,
);
```

### superjson

All tRPC routers use `superjson` as the transformer, which handles `Date`, `Map`, `Set`, and other non-JSON types automatically. Both server (`init.ts`) and client (`client.ts`) must use the same transformer.

### Error handling

Global tRPC error handling is provided by `handleTrpcError` from `lib/trpc.ts`, which is passed as `onError` when creating the Express middleware in `trpc.ts`. This handles Sentry reporting and structured logging automatically.
