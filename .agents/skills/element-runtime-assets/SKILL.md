---
name: element-runtime-assets
description: Use when creating a new PrairieLearn element or changing an element's runtime dependencies, scripts, styles, or bundled assets.
---

Use this when adding a new element under `apps/prairielearn/elements/` or when changing how an element loads JavaScript, CSS, or other runtime assets.

## Core requirement

Any file referenced from an element's `dependencies` or `dynamicDependencies` must be browser-loadable as a standalone asset. It must be bundled or otherwise self-contained so it does not rely on extra `import`/`require` resolution from the browser runtime.

In practice, this means:

- Prefer a real bundled artifact over a package entry point that still pulls in additional modules.
- Verify that the served asset can be loaded directly by the app's asset pipeline.
- If the asset needs more module resolution than the current import-map flow provides, choose a different asset or bundle it first.

## Distinguishing dependencies from dynamicDependencies

Use these two concepts carefully:

- `dependencies` are for assets that are part of the element's baseline runtime and should be loaded up front. These assets typically create global variables or otherwise register themselves with the browser runtime so that the element's code can use them immediately. They are loaded using `<script src="...">` or `<link rel="stylesheet" href="...">` tags in the page header. Element code can assume that these assets are available immediately after the page loads, and may reference its resources using global variables.
- `dynamicDependencies` are for optional or on-demand loading. They are useful when a feature, data payload, or interaction path is only needed after some user action or condition is met. They may also be used as ESM modules that are imported by the element's code at runtime, though still browser-loadable as standalone assets. They are loaded using import maps, and may be imported with `import` or `await import()` in the element's code. The element's code should not assume that it is available until it has been explicitly loaded.

## Workflow

1. Create or update the element's controller, template, CSS, JavaScript, and `info.json` together.
2. Keep the runtime asset wiring in `info.json` aligned with the actual files that are shipped and loadable in the browser.
3. Update the element docs and example-course questions when author-facing behavior changes.
4. Verify the asset path in the browser or via the app's asset-serving checks before calling the change complete.

## Typical files

- `apps/prairielearn/elements/<tag>/info.json`
- `apps/prairielearn/elements/<tag>/<tag>.py`
- `apps/prairielearn/elements/<tag>/<tag>.js`
- `apps/prairielearn/elements/<tag>/<tag>.mustache`
- `docs/elements/<tag>.md`
