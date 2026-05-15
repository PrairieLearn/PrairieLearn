---
'@prairielearn/eslint-plugin': minor
---

Add a new rule `@prairielearn/html-no-duplicate-id`. It's a variant of `@html-eslint/no-duplicate-id` that ignores tags whose names start with `pl-`, since the `id` attribute on PrairieLearn elements (e.g. `<pl-sketch-tool id="fd">`) is an element-scoped identifier consumed by the parent element, not a DOM id. It also ignores `id` values that contain mustache template parameters.
