# @prairielearn/ui

## 1.7.0

### Minor Changes

- 8326968: Debounce global filter in TanstackTable, clean up column manager API

### Patch Changes

- 037c174: Add back support for singularLabel and pluralLabel to TanstackTableCard, make `headerButtons` optional, add `hasSelection` to TanstackTableDownloadButton

## 1.6.0

### Minor Changes

- 20f25f7: Add nuqs utilities for URL query state management with server-side rendering support. Includes `NuqsAdapter` component and TanStack Table state parsers (`parseAsSortingState`, `parseAsColumnVisibilityStateWithColumns`, `parseAsColumnPinningState`, `parseAsNumericFilter`).

## 1.5.0

### Minor Changes

- bd5f2a1: Add a generic PresetFilterDropdown for customizable multi-column filters

## 1.4.0

### Minor Changes

- 02db253: Add `OverlayTrigger` component
- e6c52c9: Namespace UI classes that aren't for direct use, simplify usage
- 4d11204: Virtualize columns, add useAutoSizeColumns hook, hierarchical display of columns
- f7d6b62: - Improve options for singular/plural labels
  - Improve UI for column manager / card
  - Add ability to wrap columns
  - Add HTML props to TanstackTableCard
  - Add scrollRef to TanstackTable
  - Add virtualized element measuring to TanstackTable
  - Improve keyboard navigation in TanstackTable
- cf71f7e: Support for grouped columns in ColumnManager, empty values in NumericInputColumnFilter
- b6c34cf: Refactor state management of filters

### Patch Changes

- Updated dependencies [f7d6b62]
  - @prairielearn/browser-utils@2.6.0

## 1.3.0

### Minor Changes

- 3b54dda: Refine styling of `<CategoricalColumnFilter>`

### Patch Changes

- 9f5a05f: Improve UI of `TanstackTable` and `TanstackTableCard`

## 1.2.0

### Minor Changes

- 50dbe96: - Add optional header labels / max height for column manager
  - Add new option for buttons in next to the View column manager button
  - add MultiSelectColumnFilter
  - NumericInputColumnFilter
  - add useShiftClickCheckbox hook + update table/buttons to support row selection

## 1.1.2

### Patch Changes

- 0425922: Upgrade all JavaScript dependencies
- Updated dependencies [0425922]
  - @prairielearn/preact-cjs@1.1.6

## 1.1.1

### Patch Changes

- c0b1c74: Enable `declarationMap`
- Updated dependencies [c0b1c74]
  - @prairielearn/browser-utils@2.5.1
  - @prairielearn/preact-cjs@1.1.5

## 1.1.0

### Minor Changes

- 0ee5e51: Add support for both a empty state and a "no results" state
