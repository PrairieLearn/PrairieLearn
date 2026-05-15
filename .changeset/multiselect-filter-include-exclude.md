---
'@prairielearn/ui': minor
---

`CategoricalColumnFilter` was removed, and `MultiSelectColumnFilter` now contains the same toggle functionality, with `parseAsMultiSelectFilter` and `applyMultiSelectFilter` helpers.
`PresetFilterDropdown` now clears columns by removing them from `columnFilters` rather than writing a sentinel empty value. Consumers whose `onColumnFiltersChange` mirrors filter state elsewhere (e.g., into URL params) must reset state for column IDs that are absent from the new filters.
