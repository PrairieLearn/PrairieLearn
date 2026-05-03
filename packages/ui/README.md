# `@prairielearn/ui`

UI components, utilities, and styles shared between PrairieLearn and PrairieTest.

## UI Component Examples

### TanstackTableCard

You can refer to [`instructorStudents.html.tsx`](../../apps/prairielearn/src/pages/instructorStudents/instructorStudents.html.tsx) for an example of how to use this component.

```tsx
import { TanstackTableCard } from '@prairielearn/ui';

<TanstackTableCard
  table={table}
  title="Students"
  className="h-100"
  singularLabel="student"
  pluralLabel="students"
  downloadButtonOptions={{
    filenameBase: `${courseInstanceFilenamePrefix(courseInstance, course)}students`,
    mapRowToData: (row) => {
      return {
        uid: row.user?.uid ?? row.enrollment.pending_uid,
        name: row.user?.name ?? null,
        email: row.user?.email ?? null,
        status: row.enrollment.status,
        first_joined_at: row.enrollment.first_joined_at
          ? formatDate(row.enrollment.first_joined_at, course.display_timezone, {
              includeTz: false,
            })
          : null,
      };
    },
    hasSelection: false,
  }}
  headerButtons={
    <>
      {enrollmentManagementEnabled && (
        <Button
          variant="light"
          disabled={!authzData.has_course_instance_permission_edit}
          onClick={() => setShowInvite(true)}
        >
          <i class="bi bi-person-plus me-2" aria-hidden="true" />
          Invite student
        </Button>
      )}
    </>
  }
  globalFilter={{
    placeholder: 'Search by UID, name, email...',
  }}
  tableOptions={tableOptions}
/>;
```

You should also include the CSS file in your page:

```css
@import url('@prairielearn/ui/components/styles.css');
```

### CategoricalColumnFilter

You can refer to [`instructorStudents.html.tsx`](../../apps/prairielearn/src/pages/instructorStudents/instructorStudents.html.tsx) for an example of how to use this component.

```tsx
import { CategoricalColumnFilter } from '@prairielearn/ui';
import { parseAsArrayOf, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { EnumEnrollmentStatusSchema } from '../../lib/db-types.js';
import { EnrollmentStatusIcon } from '../../components/EnrollmentStatusIcon.js';

const STATUS_VALUES = Object.values(EnumEnrollmentStatusSchema.Values);
const DEFAULT_ENROLLMENT_STATUS_FILTER: EnumEnrollmentStatus[] = [];

const [enrollmentStatusFilter, setEnrollmentStatusFilter] = useQueryState(
  'status',
  parseAsArrayOf(parseAsStringLiteral(STATUS_VALUES)).withDefault(DEFAULT_ENROLLMENT_STATUS_FILTER),
);

const columnFilters = useMemo(() => {
  return [
    {
      id: 'enrollment_status',
      value: enrollmentStatusFilter,
    },
  ];
}, [enrollmentStatusFilter]);

// Setting up the filters in the table options
const tableOptions = {
  // ... other table options
  filters: {
    enrollment_status: ({ header }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Status"
        allColumnValues={STATUS_VALUES}
        renderValueLabel={({ value }) => <EnrollmentStatusIcon type="text" status={value} />}
        columnValuesFilter={enrollmentStatusFilter}
        setColumnValuesFilter={setEnrollmentStatusFilter}
      />
    ),
  },
};
```

### ComboBox and TagPicker

Accessible combobox components built on [React Aria](https://react-spectrum.adobe.com/react-aria/).

```tsx
import { ComboBox, TagPicker, type ComboBoxItem } from '@prairielearn/ui';
import { useState } from 'react';

const items: ComboBoxItem[] = [
  { id: '1', label: 'Apple' },
  { id: '2', label: 'Banana' },
];

// Single selection
const [selected, setSelected] = useState<string | null>(null);
<ComboBox items={items} value={selected} onChange={setSelected} label="Fruit" />;

// Multi-selection with tags
const [selectedIds, setSelectedIds] = useState<string[]>([]);
<TagPicker items={items} value={selectedIds} onChange={setSelectedIds} label="Fruits" />;
```

Items can include `searchableText` for filtering on text different from the label, and `data` for custom data passed to `renderItem`.

### FilterDropdown

A multi-select filter dropdown built on [React Aria](https://react-spectrum.adobe.com/react-aria/).

```tsx
import { FilterDropdown, type FilterItem } from '@prairielearn/ui';
import { useState } from 'react';

const items: FilterItem[] = [
  { id: '1', name: 'JavaScript', color: 'blue1' },
  { id: '2', name: 'TypeScript', color: 'blue2' },
  { id: '3', name: 'Python', color: 'green1' },
];

const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

<FilterDropdown
  label="Language"
  items={items}
  selectedIds={selectedIds}
  onChange={setSelectedIds}
/>;
```

The `color` property maps to PrairieLearn's badge color classes (e.g., `color-blue1`). Custom rendering can be provided via `renderItem`.

## nuqs Utilities

This package provides utilities for integrating [nuqs](https://nuqs.47ng.com/) (type-safe URL query state management) with server-side rendering and TanStack Table.

### NuqsAdapter

`nuqs` needs to be aware of the current state of the URL search parameters during both server-side and client-side rendering. The `NuqsAdapter` component handles this by using a custom adapter on the server that reads from a provided `search` prop, while on the client it uses nuqs's built-in React adapter that reads directly from `location.search`.

```tsx
import { NuqsAdapter } from '@prairielearn/ui';

// Wrap your component that uses nuqs hooks
<NuqsAdapter search={new URL(req.url).search}>
  <MyTableComponent />
</NuqsAdapter>;
```

### TanStack Table State Parsers

The package provides custom parsers for syncing TanStack Table state with URL query parameters:

- **`parseAsSortingState`**: Syncs table sorting state with the URL. Format: `col:asc` or `col1:asc,col2:desc` for multi-column sorting.
- **`parseAsColumnVisibilityStateWithColumns(allColumns, defaultValueRef?)`**: Syncs column visibility. Parses comma-separated visible column IDs.
- **`parseAsColumnPinningState`**: Syncs left-pinned columns. Format: `col1,col2,col3`.
- **`parseAsNumericFilter`**: Syncs numeric filter values. URL format: `gte_5`, `lte_10`, `gt_3`, `lt_7`, `eq_5`, `empty`.

```tsx
import {
  parseAsSortingState,
  parseAsColumnVisibilityStateWithColumns,
  parseAsColumnPinningState,
  parseAsNumericFilter,
} from '@prairielearn/ui';
import { useQueryState } from 'nuqs';

// Sorting state synced to URL
const [sorting, setSorting] = useQueryState('sort', parseAsSortingState.withDefault([]));

// Column visibility synced to URL
const allColumns = ['name', 'email', 'status'];
const [columnVisibility, setColumnVisibility] = useQueryState(
  'cols',
  parseAsColumnVisibilityStateWithColumns(allColumns).withDefault({}),
);

// Column pinning synced to URL
const [columnPinning, setColumnPinning] = useQueryState(
  'pin',
  parseAsColumnPinningState.withDefault({ left: [], right: [] }),
);

// Numeric filter synced to URL
const [scoreFilter, setScoreFilter] = useQueryState(
  'score',
  parseAsNumericFilter.withDefault({ filterValue: '', emptyOnly: false }),
);
```
