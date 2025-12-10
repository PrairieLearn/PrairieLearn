# `@prairielearn/preact-cjs`

This package re-exports all of Preact's exports, but _only_ the CJS versions. We can't rely on the original package, which provides both ESM and CJS exports, because we have a mixed ESM/CJS codebase and the CJS/ESM versions of Preact don't share the necessary singleton state with each other. So, we need to ensure that we always use the CJS version of Preact.
