# `@prairielearn/ui`

UI components shared between PrairieLearn and PrairieTest.

## Usage

### TanstackTableCard

You can refer to [`instructorStudents.html.tsx`](../../apps/prairielearn/src/pages/instructorStudents/instructorStudents.html.tsx) for an example of how to use this component.

```tsx
import { TanstackTableCard } from '@prairielearn/ui';

<TanstackTableCard
  table={table}
  title="Students"
  headerButtons={
    <>
      <DownloadButton
        students={students}
        table={table}
        course={course}
        courseInstance={courseInstance}
      />
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
  tableOptions={{
    filters: {
      enrollment_status: ({ header }) => (
        <StatusColumnFilter
          columnId={header.column.id}
          enrollmentStatusFilter={enrollmentStatusFilter}
          setEnrollmentStatusFilter={setEnrollmentStatusFilter}
        />
      ),
    },
  }}
/>;
```
