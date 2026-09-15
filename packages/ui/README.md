# `@prairielearn/ui`

UI components, utilities, and styles shared between PrairieLearn and PrairieTest.

## Vanilla Bootstrap tooltips

Applications using Bootstrap tooltips should install the shared accessible behavior after `document.body` is available. Pass the same Bootstrap `Tooltip` constructor used elsewhere in the application.

The shared behavior shows tooltips for hover-capable pointers and keyboard focus, keeps them open while hovered, and lets users dismiss them with Escape. It intentionally does not show tooltips in response to touch input, so tooltip content must never be required to understand or operate the trigger.

```ts
import { installBootstrapTooltipBehavior } from '@prairielearn/ui/bootstrap-tooltip';

installBootstrapTooltipBehavior({
  Tooltip: window.bootstrap.Tooltip,
});
```

## TanStack tables

`TanstackTable` and `TanstackTableCard` render table instances created by TanStack Table v9. This package configures the TanStack features used by these components, so create columns with `createTanstackTableColumnHelper` and tables with `useTanstackTable` instead of using the upstream constructors directly.

### Creating a table

Define columns with a helper specialized for your row type, create the table inside your component, and pass the resulting instance to `TanstackTableCard`:

```tsx
import {
  TanstackTableCard,
  createTanstackTableColumnHelper,
  useTanstackTable,
} from '@prairielearn/ui';

type StudentRow = {
  uid: string;
  name: string;
  status: 'joined' | 'invited' | 'removed';
};

const columnHelper = createTanstackTableColumnHelper<StudentRow>();
const columns = columnHelper.columns([
  columnHelper.accessor('uid', { header: 'UID' }),
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('status', { header: 'Status' }),
]);

export function StudentsTable({ students }: { students: StudentRow[] }) {
  const table = useTanstackTable({
    columns,
    data: students,
  });

  return (
    <TanstackTableCard
      table={table}
      title="Students"
      singularLabel="student"
      pluralLabel="students"
      globalFilter={{ placeholder: 'Search students...' }}
      tableOptions={{}}
      style={{ height: 500 }}
    />
  );
}
```

`columnHelper.columns()` preserves the individual value types when an array contains columns for different fields. Keep the resulting array referentially stable: define static columns outside the component as shown above, or memoize columns that depend on props or state.

`TanstackTable` virtualizes its rows, so its container needs a bounded height. The example uses an explicit height; in a fill-height layout, use `className="h-100"` inside an already sized parent.

Include the table styles once in the stylesheet for the page or application:

```css
@import url('@prairielearn/ui/components/styles.css');
```

Use `TanstackTable` instead of `TanstackTableCard` when you only need the table itself, without the card header, global search, column manager, or row-count status. See [`instructorStudents.html.tsx`](../../apps/prairielearn/src/pages/instructorStudents/instructorStudents.html.tsx) for a full example with controlled state, selection, custom cells, URL persistence, filters, and CSV download.

### Adding a multi-select column filter

Column filters have two parts: a `filterFn` on the column defines which rows match, and `tableOptions.filters` tells the table which control to render in that column's header. To make the basic table's `status` column filterable, replace its column definition with:

```tsx
import {
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  applyMultiSelectFilter,
} from '@prairielearn/ui';

const STATUS_VALUES = ['joined', 'invited', 'removed'] as const;

columnHelper.accessor('status', {
  header: 'Status',
  filterFn: (row, _columnId, filter: MultiSelectFilterValue<StudentRow['status']>) => {
    return applyMultiSelectFilter(filter, (values) => values.includes(row.original.status));
  },
});
```

Then update the `TanstackTableCard` inside `StudentsTable` to render the matching header control:

```tsx
<TanstackTableCard
  table={table}
  title="Students"
  singularLabel="student"
  pluralLabel="students"
  globalFilter={{ placeholder: 'Search students...' }}
  tableOptions={{
    filters: {
      status: ({ header }) => (
        <MultiSelectColumnFilter column={header.column} allColumnValues={STATUS_VALUES} />
      ),
    },
  }}
  style={{ height: 500 }}
/>
```

The filter supports both include and exclude modes. For larger value sets, pass `showSearch` to add fuzzy search with a placeholder derived from the column label. Use `searchPlaceholder` to override that placeholder, or `getSearchText` when the stored value differs from the text rendered to the user.

## URL state with `nuqs`

This package provides an adapter for using [`nuqs`](https://nuqs.47ng.com/) during server rendering and parsers for common TanStack Table state.

### Adapter

Wrap any component that uses `nuqs` hooks in `NuqsAdapter`. On the server, pass the current URL's search string; after hydration, the adapter reads from `location.search` automatically.

```tsx
import { NuqsAdapter } from '@prairielearn/ui';

<NuqsAdapter search={search}>
  <StudentsTable students={students} />
</NuqsAdapter>;
```

### Table state parsers

Import the parsers and `useQueryState` at module scope:

```tsx
import { parseAsColumnPinningState, parseAsSortingState } from '@prairielearn/ui';
import { useQueryState } from 'nuqs';
```

Then, inside `StudentsTable`, replace the original `useTanstackTable` call with URL-backed state and the corresponding change callbacks:

```tsx
const [sorting, setSorting] = useQueryState('sort', parseAsSortingState.withDefault([]));
const [columnPinning, setColumnPinning] = useQueryState(
  'pin',
  parseAsColumnPinningState.withDefault({ start: [], end: [] }),
);

const table = useTanstackTable({
  columns,
  data: students,
  state: { sorting, columnPinning },
  onSortingChange: setSorting,
  onColumnPinningChange: setColumnPinning,
});
```

The available parsers are:

- `parseAsSortingState`: sorting state, encoded as `column:asc` or `column:desc`.
- `parseAsColumnVisibilityStateWithColumns(allColumns, defaultValueRef?)`: visible column IDs, encoded as a comma-separated list.
- `parseAsColumnPinningState`: start-pinned column IDs, encoded as a comma-separated list. End pinning is not persisted by this parser.
- `parseAsNumericFilter`: a numeric comparison or empty-value filter, encoded as values such as `gte_5`, `lt_7`, or `empty`.
- `parseAsMultiSelectFilter(allowedValues?)`: include or exclude values for `MultiSelectColumnFilter`.

## Other components

### ComboBox and TagPicker

`ComboBox` and `TagPicker` are accessible single- and multi-selection inputs built on [React Aria](https://react-spectrum.adobe.com/react-aria/).

```tsx
import { ComboBox, TagPicker, type ComboBoxItem } from '@prairielearn/ui';
import { useState } from 'react';

const items: ComboBoxItem[] = [
  { id: '1', label: 'Apple' },
  { id: '2', label: 'Banana' },
];

function FruitInputs() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  return (
    <>
      <ComboBox items={items} value={selectedId} onChange={setSelectedId} label="Favorite fruit" />
      <TagPicker
        items={items}
        value={selectedIds}
        onChange={setSelectedIds}
        label="Available fruits"
      />
    </>
  );
}
```

Items can include `searchableText` for filtering on text different from the label, and `data` for custom data passed to `renderItem`.

### FilterDropdown

`FilterDropdown` is an accessible multi-select dropdown for a set of filter values.

```tsx
import { FilterDropdown, type FilterItem } from '@prairielearn/ui';
import { useState } from 'react';

const items: FilterItem[] = [
  { id: '1', name: 'JavaScript', color: 'blue1' },
  { id: '2', name: 'TypeScript', color: 'blue2' },
  { id: '3', name: 'Python', color: 'green1' },
];

function LanguageFilter() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  return (
    <FilterDropdown
      label="Language"
      items={items}
      selectedIds={selectedIds}
      onChange={setSelectedIds}
    />
  );
}
```

The `color` property maps to PrairieLearn's badge color classes, such as `color-blue1`. Use `renderItem` for custom rendering.

### Popover

Use `Popover` for contextual help, unavailable-action reasons, warnings, and other information that must be available on touch devices. Its trigger must be an interactive element that forwards its ref to the underlying DOM element.

An unavailable action that opens an explanation is still interactive, so do not set `disabled` or `aria-disabled` on its trigger. Give it a visually inactive treatment and a concise accessible name that describes the explanation it opens.

```tsx
import { Popover } from '@prairielearn/ui';

<Popover content="This action is unavailable until the course has been synced.">
  <button
    type="button"
    className="btn btn-outline-secondary opacity-50"
    aria-label="Why publishing is unavailable"
  >
    Publish
  </button>
</Popover>;
```

### Tooltip

Use `Tooltip` for a brief, nonessential, noninteractive description of an enabled control. Tooltips appear on hover-capable pointers and keyboard focus, remain open while hovered, and can be dismissed with Escape. They intentionally do not appear on touch devices; use `Popover` when the information must be available on touch or after pressing the trigger.

The trigger must be a focusable element that forwards its ref to the underlying DOM element. Give the trigger its own accessible name because the tooltip supplements that name rather than replacing it.

```tsx
import { Tooltip } from '@prairielearn/ui';

<Tooltip content="Download responses as a CSV file">
  <button type="button" className="btn btn-outline-secondary" aria-label="Download responses">
    <i className="bi bi-download" aria-hidden="true" />
  </button>
</Tooltip>;
```
