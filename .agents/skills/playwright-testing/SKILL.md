---
name: playwright-testing
description: Write end-to-end browser tests using Playwright.
---

New E2E tests should be created in `apps/prairielearn/src/tests/e2e`. Each test file should be named `*.e2e.spec.{ts,tsx}` and contain tests for a specific feature or user flow.

`expect` and `test` should be imported from `apps/prairielearn/src/tests/e2e/fixtures.ts`. These include fixtures to start the PrairieLearn server and provide an editable test course.

Prefer using selectors that use user-facing content, such as `getByRole`, `getByText`, and `getByLabelText`. If that's impractical, consider using `getByTestId` instead. Avoid using `locator()` with implementation details like CSS classes or IDs unless absolutely necessary.
