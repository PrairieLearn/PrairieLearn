# Organization

This is a monorepo that contains both applications (in `apps/*`) and libraries (in `packages/*`).

- Use `yarn` (v4) to manage dependencies and run scripts.
- The `Makefile` at the root of the repository contains commands for common tasks.

## Applications

- `apps/prairielearn`: The main PrairieLearn web application.
- `apps/grader-host`: The application that runs external grading jobs.
- `apps/workspace-host`: The application that runs workspace containers.

All applications share a single Postgres database. See `database/` for descriptions of the database tables and enums. All tables have corresponding Zod types in `apps/prairielearn/src/lib/db-types.ts`.

Migrations are stored in `apps/prairielearn/src/migrations`. See the `README.md` file in that directory for details on how to create and run migrations.

## Building and type checking

When possible, use a dedicated tool call to check for type errors/issues/problems in individual files during iteration, as this is faster than checking every file.

Run `make build` from the root directory to build all TypeScript code and check types.

Run `make typecheck-python` from the root directory to type check all Python code.

## Linting and formatting

When possible, use a dedicated tool call to check for linting and formatting issues in individual files during iteration, as this is faster than checking every file.

If you don't have a suitable tool available, you can still format and lint individual files: use `yarn eslint ...`/`yarn prettier ...` for TypeScript files and `ruff ...` for Python files.

Run `make format-js`/`make lint-js` from the root directory to format/lint all TypeScript code.

Run `make format-python`/`make lint-python` from the root directory to format/lint all Python code.

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

## Rendering HTML

The PrairieLearn web application renders HTML in one of two ways:

- Static HTML is rendered with an `html` tagged-template literal from the `@prairielearn/html` package. See `packages/html/README.md` for details.
- Interactive components are built and rendered with Preact and hydrated with utilities from the `@prairielearn/preact` package. See `packages/preact/README.md` for details.
