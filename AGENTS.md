# Organization

This is a monorepo that contains both applications (in `apps/*`) and libraries (in `packages/*`).

- Use `yarn` (v4) to manage dependencies and run scripts.
- The `Makefile` at the root of the repository contains commands for common tasks.

## Applications

- `apps/prairielearn`: The main PrairieLearn web application.
- `apps/grader-host`: The application that runs external grading jobs.
- `apps/workspace-host`: The application that runs workspace containers.

If you update a package in `packages/`, make sure to add a changeset.

## Building and type checking

When possible, use a dedicated tool call to check for type errors/issues/problems in individual files during iteration, as this is faster than checking every file.

Run `make build` from the root directory to build all TypeScript code and check types. You will need to do this after making changes to a package.

Run `make typecheck-python` from the root directory to type check all Python code.

## Database and Schema changes

All applications share a single Postgres database. See `database/` for descriptions of the database tables and enums. All tables have corresponding Zod types in `apps/prairielearn/src/lib/db-types.ts`.

Migrations are stored in `apps/prairielearn/src/migrations`. See the [`README.md`](apps/prairielearn/src/migrations/README.md) file in that directory for details on how to create and run migrations.

If you make a change to the database, make sure to update the database schema description in `database/` and the Zod types/table list in `apps/prairielearn/src/lib/db-types.ts`.

If you make a change to a schema file in `schemas/`, make sure to update the JSON schema with `make update-jsonschema`.

## Linting and formatting

When possible, use a dedicated tool call to check for linting and formatting issues in individual files during iteration, as this is faster than checking every file.

If you don't have a suitable tool available, you can still format and lint individual files: use `yarn eslint ...` / `yarn prettier ...` for TypeScript files and `ruff ...` for Python files.

Run `make format-js-cached` / `make lint-js-cached` from the root directory to format/lint all TypeScript code.

Run `make format-python` / `make lint-python` from the root directory to format/lint all Python code.

## Conventions

### Stylistic conventions

- NEVER use `as any` casts in TypeScript code to avoid type errors.
- Don't add extra defensive checks or try/catch blocks that are abnormal for that area of the codebase (especially if called by trusted / validated codepaths).
- Don't add extra comments that a human wouldn't add or that are inconsistent with the rest of the file.

### Library usage conventions

- Use `@tanstack/react-query` for API calls.
- Use `react-hook-form` for form handling.

### User interface conventions

- Use `react-bootstrap` components for UI elements.
- Titles and buttons should use sentence case.

## Testing

TypeScript tests are written with Vitest. Unit tests are located next to the code they test in files with a `.test.ts` suffix. Integration tests are located in dedicated `tests` directories, e.g. `apps/prairielearn/src/tests`.

Python tests are written with Pytest.

When possible, use a dedicated tool call to run individual tests during iteration. If you do not have a suitable tool available, you can run single test files:

- For TypeScript tests, use `yarn test path/to/file.test.ts` from the root directory.
- For Python tests, use `pytest path/to/testfile.py` from the root directory.

Avoid running the entire test suite unless necessary, as it can be time-consuming. However, if you must:

- To run all TypeScript tests, use `yarn test` from the root directory
- To run all Python tests, use `make test-python` from the root directory.

Tests expect Postgres, Redis, and an S3-compatible store to be running, and usually they already are. If you suspect that they're not, run `make start-support` from the root directory.

To test UI code looks correct, you should try to connect to the development server at `http://localhost:3000` and screenshot the page with `playwright`. A development server can be started with `make dev`, but the developer has typically already started one up.

## Rendering HTML

The PrairieLearn web application renders HTML in one of two ways:

- Static HTML is rendered with an `html` tagged-template literal from the `@prairielearn/html` package. See [`packages/html/README.md`](packages/html/README.md) for details.
- Interactive components are built and rendered with Preact and hydrated with utilities from the `@prairielearn/preact` package. See [`packages/preact/README.md`](packages/preact/README.md) for details.

## Preact quirks

- A file at `./foo.tsx` should be imported as `./foo.js` from other files.
- Use `clsx` and `class="..."` in Preact components.
- Pass `res.locals` to `getPageContext` to get information about the course instance / authentication state.
- If you hydrate a component with `Hydrate`, you must register the component with `registerHydratedComponent` in a file in `apps/prairielearn/assets/scripts/esm-bundles/hydrated-components`.
- If you get a build error relating to the type of an error being unknown, you can use `yarn tsc -p assets/scripts/tsconfig.json --traceResolution` to debug the issue.
