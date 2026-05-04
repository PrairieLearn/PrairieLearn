---
'@prairielearn/ui': major
---

Replace `StickyActionBar` with new `StickySaveBar` component. `StickySaveBar` has a fixed Save/Cancel layout for form submission and is always wired to react-hook-form's `isDirty`/`isSubmitting`. Consumers that need a generic action bar should render their own.
