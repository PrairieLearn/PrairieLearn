# @prairielearn/ui

## 3.7.1

### Patch Changes

- 4a0ee46: Bump dependencies

## 3.7.0

### Minor Changes

- e3c07aa: Add `BooleanColumnFilter` and `applyBooleanFilter` for boolean-valued table columns, and add a `showModeToggle` prop to `MultiSelectColumnFilter`

## 3.6.0

### Minor Changes

- 74672f0: Add an optional `unit` prop to `NumericInputColumnFilter` to show a unit label (e.g. "minutes") in the filter dropdown.

## 3.5.2

### Patch Changes

- 3f0b326: Upgrade all JavaScript dependencies

## 3.5.1

### Patch Changes

- 56efa59: Simplify the sticky save bar button label to "Save".

## 3.5.0

### Minor Changes

- 19b8b6e: Support cell-content-based auto-sizing via `autoSizeSample` on column meta
- 3070141: Fix `useShiftClickCheckbox` so shift-click range selection works correctly when the table is sorted or filtered. The hook now tracks the last-clicked row's id and computes the range against the current row-model positions, instead of `row.index` (which is the pre-sort data index).
- 5558c93: Add `mapRowToJsonData` option to `TanstackTableDownloadButton` for proper JSON export formatting.
- 0a7a8ff: `CategoricalColumnFilter` was removed, and `MultiSelectColumnFilter` now contains the same toggle functionality, with `parseAsMultiSelectFilter` and `applyMultiSelectFilter` helpers.
  `PresetFilterDropdown` now clears columns by removing them from `columnFilters` rather than writing a sentinel empty value. Consumers whose `onColumnFiltersChange` mirrors filter state elsewhere (e.g., into URL params) must reset state for column IDs that are absent from the new filters.
- 19b8b6e: Add `extractLeafColumnIds`. Add scroll to CategoricalColumnFilter dropdown. Use useLayoutEffect for indeterminate checkbox state in ColumnManager.
- 19b8b6e: Fix bug with autosizing table columns - it now uses the filtered row set
  Add a clear-filters control via `onResetColumnFilters`
  Add `useColumnFilters` hook to reduce boilerplate and improve typing

### Patch Changes

- d195079: Remove unused SplitPane CSS that forced Bootstrap grid columns in the detail panel to full width.

## 3.4.1

### Patch Changes

- 9ec69b0: Vertically center the icon and label in the `StickySaveBar` save button.

## 3.4.0

### Minor Changes

- 647a35a: Add an `alert` slot to `StickySaveBar` that renders save feedback inside the sticky region, and a `fullWidth` prop that lets the actions row span the full width of full-width pages.
- 6fd6eab: Replace `StickyActionBar` with new `StickySaveBar` component.

### Patch Changes

- 382dbd8: Bump dependencies

## 3.3.0

### Minor Changes

- f3e7b53: Add `RadioGroup`, `Radio`, `IndeterminateCheckbox`, and `ExpandableCheckboxGroup` components
- 24d9afc: Add `RichSelect` component for single-selection dropdowns with descriptions per option
- a00d61f: Add `useResizeHandle` hook for keyboard-accessible split pane resizers
- f3e7b53: Add `additionalMenuItems` prop to `TanstackTableDownloadButton` for custom dropdown items
- 14bb451: Add `SplitPane` component
- 1e00357: Add `useColumnVisibilityQueryState` hook for URL-persisted column visibility. Add `statusContent` prop to `TanstackTableCard` for custom status text.
- 07dfbca: Add `StickyActionBar` component for displaying save/cancel actions in a sticky bottom bar

### Patch Changes

- 98f6be5: Removed "autoComplete=true" attrs on CategoricalColumnFilter radio buttons because of noncompliance with accessibility requirements
- 1e00357: Fix ColumnManager rendering an unnecessary divider when only top content is present.
- 6ee5647: Fix column manager dropdown closing when clicking checkbox labels
- a00d61f: Fix inconsistent vertical padding in FilterDropdown list
- dab7ca0: Fix OverlayTrigger focus trapping when trigger prop is an array
- dab7ca0: Fix OverlayTrigger returning focus on tooltip dismiss, which created an infinite focus loop for focus-triggered tooltips
- f3e7b53: Fix Radio component to render a visible radio indicator since react-aria visually hides the native input
- 0dd8480: Fix resize handle width desync when bounds change dynamically
- e918ccb: Allow `TanstackTableCsvCell` values to be `string[]`. Array values are joined with `'; '` in CSV exports and serialized as arrays in JSON exports.
- 1e00357: Hide the View dropdown in TanstackTableCard when no columns are hideable
- b6e03e9: Upgrade dependencies
- f8eb106: Replace react-aria-components with react-bootstrap Form.Check in RadioGroup and Radio components
- e756585: Return no-op onChange handler in useShiftClickCheckbox
- 07dfbca: Add gap to split pane right panel header to prevent text and buttons from touching at narrow widths
- d2df970: Make `useModalState` callbacks referentially stable with `useCallback`
- aaeb317: TagPicker: Fix rendering bugs, and move selected tags outside the `ComboBox` component to avoid nested interactive elements.
  ComboBox: Refactor implementation
- 45221b9: Make TanstackTable easier to test
- aaeb317: Replace the `TagPicker` Select-based workaround with React Aria's released multi-select ComboBox implementation.
- Updated dependencies [b6e03e9]
  - @prairielearn/browser-utils@2.7.2
  - @prairielearn/run@2.0.3

## 3.2.2

### Patch Changes

- 144cd19: Fix ComboBox type compatibility with react-aria-components 1.16.0
- 144cd19: Upgrade all JavaScript dependencies

## 3.2.1

### Patch Changes

- 3c4799a: Upgrade all JavaScript dependencies
- bfcdf32: Return no-op onChange handler in useShiftClickCheckbox
- Updated dependencies [3c4799a]
  - @prairielearn/browser-utils@2.7.1
  - @prairielearn/run@2.0.2

## 3.2.0

### Minor Changes

- c078fcb: Add `pinnedIds` prop to `FilterDropdown` to pin specific items at the top of the list
- c078fcb: Add `FilterDropdown` component

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
