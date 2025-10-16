# `@prairielearn/ui`

UI components and styles shared between PrairieLearn and PrairieTest.

## Examples

### TanstackTableCard

You can refer to [`instructorStudents.html.tsx`](../../apps/prairielearn/src/pages/instructorStudents/instructorStudents.html.tsx) for an example of how to use this component.

```tsx
import { TanstackTableCard } from '@prairielearn/ui';

<TanstackTableCard
  table={table}
  title="Students"
  downloadButtonOptions={{
    filenameBase: `${courseInstanceFilenamePrefix(courseInstance, course)}students`,
    singularLabel: 'student',
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
    value: globalFilter,
    setValue: setGlobalFilter,
    placeholder: 'Search by UID, name, email...',
  }}
  tableOptions={tableOptions}
/>;
```

You should also include the CSS file in your page:

```css
@import url('@prairielearn/ui/components/TanstackTable.css');
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
