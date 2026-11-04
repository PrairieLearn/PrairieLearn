---
name: playwright-testing
description: Write or update the repository's Playwright E2E tests.
---

New E2E tests should be created in `apps/prairielearn/src/tests/e2e`. Each test file should be named `*.spec.{ts,tsx}` and contain tests for a specific feature or user flow.

`expect` and `test` should be imported from `apps/prairielearn/src/tests/e2e/fixtures.ts`. These include fixtures to start the PrairieLearn server and provide an editable test course.

Prefer using selectors that use user-facing content, such as `getByRole`, `getByText`, and `getByLabel`. If that's impractical, consider using `getByTestId` and adding a `data-testid` attribute when needed. Avoid using `locator()` with implementation details like CSS classes or IDs unless absolutely necessary.

Playwright e2e tests run fully in parallel (`fullyParallel: true`). Each test must be self-contained — set up its own state (users, enrollments, etc.) rather than relying on shared mutable state from `beforeAll`. Use the `courseInstance` fixture for the default course instance. Don't use module-level variables to share state between tests.

Each worker's server and database are shared by every spec file that worker runs, so don't assume a fresh database: avoid asserting exact counts of rows that other specs may also create, and give users created via config overrides (`authUid` etc.) their own `authUin`. To run tests with different config values, use `createTest({ ... })`; the overrides are applied at runtime for each test and don't start a separate server.
