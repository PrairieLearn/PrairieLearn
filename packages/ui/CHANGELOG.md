# @prairielearn/ui

## 3.1.5

### Patch Changes

- e28f2e2: Replace `JSX.Element` with `ReactNode` in component type definitions
- Updated dependencies [ad329f9]
- Updated dependencies [7b937fb]
  - @prairielearn/browser-utils@2.7.0

## 3.1.4

### Patch Changes

- 5381771: Use `ReactNode` instead of `JSX.Element` for `TanstackTableCard` and `ColumnManager` props

## 3.1.3

### Patch Changes

- c34d474: Add @prairielearn/run as dep

## 3.1.2

### Patch Changes

- cde69c1: Upgrade all JavaScript dependencies
- aae8ad7: Fix ColumnManager not properly unchecking a group of columns

## 3.1.1

### Patch Changes

- 8bdf6ea: Upgrade all JavaScript dependencies
- Updated dependencies [8bdf6ea]
  - @prairielearn/browser-utils@2.6.3

## 3.1.0

### Minor Changes

- 3f7e76a: Add `<ComboBox>` and `<TagPicker>` components

## 3.0.0

### Major Changes

- 3914bb4: Upgrade to Node 24

### Patch Changes

- f1da6ea: Make `useAutoSizeColumns` compatible with React 18+
  - @prairielearn/browser-utils@2.6.2

## 2.0.0

### Major Changes

- d94c74c: Use React instead of Preact

### Patch Changes

- 0900843: Switch to the `tsgo` compiler
- Updated dependencies [0900843]
  - @prairielearn/browser-utils@2.6.1

## 1.10.0

### Minor Changes

- e2bffd9: Prefer `className` instead of `class`

### Patch Changes

- Updated dependencies [e2bffd9]
  - @prairielearn/preact-cjs@2.0.0

## 1.9.1

### Patch Changes

- f404bb4: Upgrade all JavaScript dependencies

## 1.9.0

### Minor Changes

- 3954e02: Allow for duplicate column names in CSV export

### Patch Changes

- 926403c: Refactor `useAutoSizeColumns` hook
- 70a8029: Upgrade all JavaScript dependencies
- Updated dependencies [70a8029]
  - @prairielearn/preact-cjs@1.1.7

## 1.8.0

### Minor Changes

- e279b47: Add `useModalState` hook

### Patch Changes

- 230c3a3: Replace usage of `findLastIndex` with ponyfill

## 1.7.2

### Patch Changes

- 7ba5db4: Use `currentTarget` instead of `target` in event handlers

## 1.7.1

### Patch Changes

- 90c712d: Improve style of table when it is less than viewport width

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
