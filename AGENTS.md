# PrairieLearn

PrairieLearn is an educational learning platform with a focus on automated assessments.
This is a monorepo that contains both applications (in `apps/*`) and libraries (in `packages/*`).

## Tech stack

Frontend: TypeScript / React / Bootstrap / Tanstack
Backend: TypeScript / Express / Python / PostgreSQL

## Applications

- `apps/prairielearn`: The main PrairieLearn web application. Key files:
  - `apps/prairielearn/src/server.ts`: Entry point for the PrairieLearn web application. Initializes the Express server and maps URLs to pages.
  - `apps/prairielearn/src/pages/`: Individual pages of the PrairieLearn application. You would add a new page here.

- `apps/grader-host`: The application that runs external grading jobs.
- `apps/workspace-host`: The application that runs workspace containers.

## Packages

Libraries live in `packages/`. If you update a package, you MUST add a changeset. Create a markdown file in `.changeset/` with a name like `fix-my-bug.md` containing:

```markdown
---
'@prairielearn/package-name': patch
---

Description of the change
```

Use `patch` for bug fixes, `minor` for new features, and `major` for breaking changes.

Frequently used packages:

- `@prairielearn/ui`: UI components for the PrairieLearn web application.

## Git

- NEVER amend commits or force push unless specifically requested.
- NEVER rebase unless specifically requested, always use merge commits.
- ALWAYS create pull requests as drafts unless specifically requested.

## Building, type checking, and linting

When working on a task, you should typecheck / lint / format individual files as you go. When you are done, you should typecheck / lint / format all changed files.

Run `make format-changed` from the root directory to format all changed files (staged + unstaged + untracked) compared to HEAD. This is useful for formatting all your work-in-progress changes.

### TypeScript

Typechecking:

- Individual files: `./scripts/typecheck-file.sh path/to/file.ts [path/to/file2.ts] ...`
- All files: `make build`. You will need to do this after making changes to a package.

Linting:

- Individual files: `yarn eslint --fix path/to/file.ts`. Prefer using a skill / LSP / MCP for this to improve performance.
- All files: `make lint-js`
- Check for dead code with `make check-dependencies`.

Formatting:

- Individual files: `yarn prettier --write path/to/file.ts`
- All files: `make format-js`

### Python

Typechecking:

- Individual files: `yarn pyright path/to/file.py`. Prefer using a skill / LSP / MCP for this to improve performance.
- All files: `make typecheck-python`

Linting:

- Individual files: `uv run ruff check --fix path/to/file.py`
- All files: `make lint-python`

Formatting:

- Individual files: `uv run ruff format path/to/file.py`
- All files: `make format-python`

### Other tools / languages (e.g. SQL, Markdown, Shell)

SQL, shell, markdown, and JSON files should also be formatted with `yarn prettier --write path/to/file.{sql,sh,md,json}`.
Reference the Makefile for commands to format/lint/typecheck other tools / languages.

## Database and schema changes

All applications share a single Postgres database. See `database/` for descriptions of the database tables and enums. All tables have corresponding Zod types in `apps/prairielearn/src/lib/db-types.ts`.

Migrations are stored in `apps/prairielearn/src/migrations`. When working with migrations, ALWAYS refer to the migration [`README.md`](apps/prairielearn/src/migrations/README.md) for details on how to create, run, and sequence migrations. Migrations are often a multi-step process that should be broken into multiple PRs.

If a migration was created on the current feature branch (i.e., it has not been merged to master), modify it directly instead of creating a new migration.

If you make a change to the database, make sure to update the database schema description in `database/` and the Zod types/table list in `apps/prairielearn/src/lib/db-types.ts`.

**Always prefer existing model functions over one-off raw SQL queries.** Check `apps/prairielearn/src/models/` for existing functions before writing any database queries. Model functions provide type safety, consistent patterns, and proper abstractions. Only write raw queries when no suitable model function exists.

When inserting audit events (`insertAuditEvent`), always do so inside the same transaction as the action being audited. Use `runInTransactionAsync` to wrap the original database mutation and its corresponding audit log insertion together. This ensures that if either the action or the audit event fails, both are rolled back.

Course content repositories use JSON files like `infoCourse.json`, `infoCourseInstance.json`, and `infoAssessment.json` to configure different parts of the course. The schemas for these files are stored as Zod schemas in `schemas/`. If you make a change to a schema file in `schemas/`, make sure to update the JSON schema with `make update-jsonschema`.

When working with assessment "groups" / "teams", see the [`groups-and-teams` skill](./.agents/skills/groups-and-teams/SKILL.md).

### SQL query conventions

- Use `to_jsonb(table.*)` if you need to select all columns from a table as JSON. This is preferred over explicit `jsonb_build_object` calls because it automatically includes all columns and stays in sync with schema changes.

## TypeScript guidance

### Library usage conventions

- Use `tRPC + @trpc/tanstack-react-query` for new client/server communication. When interacting with existing REST APIs, use `@tanstack/react-query`.
- Use `react-hook-form` for form handling.
- Prefer `extractPageContext(res.locals, ...)` over accessing `res.locals` properties directly in route handlers. This provides better type safety and ensures consistent access patterns.
- Use `nuqs` for URL query state in hydrated components. Use `NuqsAdapter` from `@prairielearn/ui` and pass the search string from the router. See `pages/home/` for an example.

### Common mistakes & gotchas

- Information about the current user, course instance, course, etc. is stored in `res.locals` in route handlers. Types for `res.locals` are defined in `apps/prairielearn/src/lib/res-locals.ts`.
- NEVER use `as any` casts in TypeScript code to avoid type errors.
- Don't add extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths).
- Don't add extra comments that a human wouldn't add or that are inconsistent with the rest of the file.
- Always check for existing model functions in `apps/prairielearn/src/models/` or lib functions before writing one-off database queries.
- Express request handlers must always either send a response (either by calling `res.send`/etc. or throwing an error) or explicitly pass control by calling `next(...)`.
- DO NOT re-export functions or types from other modules for convenience or backward compatibility within applications (e.g. `export { bar } from 'foo'` in `apps/*`). When moving a function to a new module, update all callers to import from the new location directly. Package-level barrel exports in `packages/*/src/index.ts` are expected and should be used to provide a clean public API.

### User interface conventions

- Use `react-bootstrap` components for UI elements.
- Titles and buttons should use sentence case ("Save course", "Discard these changes").
- Prefer using [Bootstrap Icons](https://icons.getbootstrap.com/) for icons in new code.

### Testing

Integration and unit tests are written with Vitest. End-to-end tests are written with Playwright. Unit tests are located next to the code they test in files with a `.test.ts` suffix. Integration tests are located in dedicated `tests` directories, e.g. `apps/prairielearn/src/tests`. End-to-end tests are located in `apps/prairielearn/src/tests/e2e`.

Individual tests:

- For integration and unit tests, use `yarn test path/to/file.test.ts` from the root directory.
- For end-to-end tests, use `yarn test:e2e path/to/integration.spec.ts` from the root directory.

Avoid running the entire test suite unless necessary, as it can be time-consuming. However, if you must:

- To run all TypeScript tests, use `yarn test` from the root directory

Tests expect Postgres, Redis, and an S3-compatible store to be running, and usually they already are. If you suspect that they're not, run `make start-support` from the root directory.

To test UI code looks correct, you should try to connect to the development server and screenshot the page with `playwright`. The dev server runs on the port specified by the `CONDUCTOR_PORT` environment variable (if set) or `3000`. If you can't determine the port, ask the user.

When writing tests:

- Don't add assertion messages unless they provide information that isn't obvious from reading the assertion itself (e.g., `assert.isNull(linkRecord)` is clear without a message).
- Don't use defensive checks in tests -- tests should fail fast if unexpected data exists.
- Don't add comments that narrate what the code already says (e.g., `// Click the button` before a `.click()` call). Only add comments when the intent isn't obvious from reading the code.
- Prefer using the existing test course and its course instances for testing. Don't create new courses or course instances just to get a clean slate; instead, use transaction rollbacks or wipe the state between tests.

### Rendering HTML

The PrairieLearn web application renders HTML in one of two ways:

- Static HTML is rendered with an `html` tagged-template literal from the `@prairielearn/html` package. See [`packages/html/README.md`](packages/html/README.md) for details.
- Interactive components are built and rendered with React and hydrated with utilities from the `@prairielearn/react` package. See [`packages/react/README.md`](packages/react/README.md) for details.

Inline `PageLayout` directly in the Express route handler rather than creating wrapper components. See `pages/publicQuestions/publicQuestions.tsx` for an example.

### React guidance

- A file at `./foo.tsx` should be imported as `./foo.js` from other files.
- Use `clsx` in React components.
- Inline prop definitions for components if they are not used outside of the component.
- Pass `res.locals` to `getPageContext` to get information about the course instance / authentication state.
- If you hydrate a component with `Hydrate`, you must register the component with `registerHydratedComponent` in a file in `apps/prairielearn/assets/scripts/esm-bundles/hydrated-components`.
- Don't use `useMemo` for cheap computations. Use `run` from `@prairielearn/run` instead (an IIFE helper that executes a function immediately).
- Avoid unnecessary `useEffect` when using `react-hook-form`. The `watch()` function returns reactive values that trigger re-renders automatically, so derived state can be computed directly without `useEffect`.

## Python guidance

Elements (similar to React components, used to build interactive questions) are written in Python and are located in `apps/prairielearn/elements/`.

When changing element properties or options, you MUST update the corresponding documentation in `docs/elements/<element-name>.md` to match.

### Testing

- For Python tests, use `uv run pytest path/to/testfile.py` from the root directory.
- To run all Python tests, use `make test-python` from the root directory.

## Meta-management

When you get corrected or discover a codebase convention through trial and error, consider whether adding a rule to this file would prevent the same mistake in future sessions. Only propose an addition if:

- The mistake stems from something non-obvious about this codebase (not general best practices).
- It's likely to recur — another agent reading the current instructions would plausibly make the same error.
- It can be stated as a direct rule ("Use X", "Don't do Y"), not a narrative about what happened.

When proposing, suggest the specific text and which section it belongs in. Don't add it without user approval.
