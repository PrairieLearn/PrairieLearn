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

Libraries live in `packages/`. If you update a package, you MUST add a changeset using `yarn changeset`.

Frequently used packages:

- `@prairielearn/ui`: UI components for the PrairieLearn web application.

## Building, type checking, and linting

When working on a task, you should typecheck / lint / format individual files as you go. When you are done, you should typecheck / lint / format all changed files.

Run `make format-changed` from the root directory to format all changed files (staged + unstaged + untracked) compared to HEAD. This is useful for formatting all your work-in-progress changes.

### TypeScript

Typechecking:

- Individual files: use `./scripts/typecheck-file.sh path/to/file.ts`
- All files: `make build`. You will need to do this after making changes to a package.

Linting:

- Individual files: `yarn eslint --fix path/to/file.ts`. Prefer using a skill / LSP / MCP for this to improve performance.
- All files: `make lint-js`

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

Migrations are stored in `apps/prairielearn/src/migrations`. See the [`README.md`](apps/prairielearn/src/migrations/README.md) file in that directory for details on how to create and run migrations.

If you make a change to the database, make sure to update the database schema description in `database/` and the Zod types/table list in `apps/prairielearn/src/lib/db-types.ts`.

Prefer interacting with the database using model functions in `apps/prairielearn/src/models/`.

Course content repositories use JSON files like `infoCourse.json`, `infoCourseInstance.json`, and `infoAssessment.json` to configure different parts of the course. The schemas for these files are stored as Zod schemas in `schemas/`. If you make a change to a schema file in `schemas/`, make sure to update the JSON schema with `make update-jsonschema`.

## TypeScript guidance

### Library usage conventions

- Use `@tanstack/react-query` for API calls.
- Use `react-hook-form` for form handling.
- Prefer `extractPageContext(res.locals, ...)` over accessing `res.locals` properties directly in route handlers. This provides better type safety and ensures consistent access patterns.
- Use `nuqs` for URL query state in hydrated components. Use `NuqsAdapter` from `@prairielearn/ui` and pass the search string from the router. See `pages/home/` for an example.

### Common mistakes & gotchas

- Information about the current user, course instance, course, etc. is stored in `res.locals` in route handlers. Types for `res.locals` are defined in `apps/prairielearn/src/lib/res-locals.ts`.
- NEVER use `as any` casts in TypeScript code to avoid type errors.
- Don't add extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths).
- Don't add extra comments that a human wouldn't add or that are inconsistent with the rest of the file.
- Always check for existing model functions in `apps/prairielearn/src/models/` or lib functions before writing one-off database queries.

### User interface conventions

- Use `react-bootstrap` components for UI elements.
- Titles and buttons should use sentence case ("Save course", "Discard these changes").

### Testing

Integration and unit tests are written with Vitest. End-to-end tests are written with Playwright. Unit tests are located next to the code they test in files with a `.test.ts` suffix. Integration tests are located in dedicated `tests` directories, e.g. `apps/prairielearn/src/tests`. End-to-end tests are located in `apps/prairielearn/src/tests/e2e`.

Individual tests:

- For integration and unit tests, use `yarn test path/to/file.test.ts` from the root directory.
- For end-to-end tests, use `yarn test:e2e path/to/integration.spec.ts` from the root directory.

Avoid running the entire test suite unless necessary, as it can be time-consuming. However, if you must:

- To run all TypeScript tests, use `yarn test` from the root directory

Tests expect Postgres, Redis, and an S3-compatible store to be running, and usually they already are. If you suspect that they're not, run `make start-support` from the root directory.

To test UI code looks correct, you should try to connect to the development server at `http://localhost:3000` and screenshot the page with `playwright`. A development server can be started with `make dev`, but the developer has typically already started one up.

### Rendering HTML

The PrairieLearn web application renders HTML in one of two ways:

- Static HTML is rendered with an `html` tagged-template literal from the `@prairielearn/html` package. See [`packages/html/README.md`](packages/html/README.md) for details.
- Interactive components are built and rendered with React and hydrated with utilities from the `@prairielearn/react` package. See [`packages/react/README.md`](packages/react/README.md) for details.

### React guidance

- A file at `./foo.tsx` should be imported as `./foo.js` from other files.
- Use `clsx` in React components.
- Pass `res.locals` to `getPageContext` to get information about the course instance / authentication state.
- If you hydrate a component with `Hydrate`, you must register the component with `registerHydratedComponent` in a file in `apps/prairielearn/assets/scripts/esm-bundles/hydrated-components`.

## Python guidance

Elements (similar to React components, used to build interactive questions) are written in Python and are located in `apps/prairielearn/elements/`.

### Testing

- For Python tests, use `uv run pytest path/to/testfile.py` from the root directory.
- To run all Python tests, use `make test-python` from the root directory.
