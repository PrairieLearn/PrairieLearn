---
'@prairielearn/ui': patch
---

TagPicker: Fix rendering bugs, and switch to using a `Select` component instead of a `ComboBox` component. Move
selected tags outside the `Select` component to avoid nested interactive elements.
ComboBox: Refactor implementation
