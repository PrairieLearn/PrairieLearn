---
'@prairielearn/compiled-assets': minor
---

Build the code-split ESM bundles with Rolldown instead of esbuild. Rolldown links imports through side-effect-free re-exports to the modules that define them, so an entry point no longer loads every module that a package index re-exports. Importing CSS from these bundles is no longer supported; load stylesheets through `compiledStylesheetTag()` instead.
