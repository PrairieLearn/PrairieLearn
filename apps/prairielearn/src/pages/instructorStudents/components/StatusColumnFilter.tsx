import { CategoricalColumnFilter } from '@prairielearn/ui';

import { EnrollmentStatusIcon } from '../../../components/EnrollmentStatusIcon.js';
import type { EnumEnrollmentStatus } from '../../../lib/db-types.js';
import { STATUS_VALUES } from '../instructorStudents.shared.js';

export function StatusColumnFilter({
  columnId,
  enrollmentStatusFilter,
  setEnrollmentStatusFilter,
}: {
  columnId: string;
  enrollmentStatusFilter: EnumEnrollmentStatus[];
  setEnrollmentStatusFilter: (value: EnumEnrollmentStatus[]) => void;
}) {
  return (
    <CategoricalColumnFilter
      columnId={columnId}
      columnLabel="Status"
      allValues={STATUS_VALUES}
      renderValueLabel={({ value }) => <EnrollmentStatusIcon type="text" status={value} />}
      valuesFilter={enrollmentStatusFilter}
      setValuesFilter={setEnrollmentStatusFilter}
    />
  );
}
