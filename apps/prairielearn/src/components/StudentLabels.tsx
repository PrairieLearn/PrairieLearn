import type { RowData } from '@tanstack/react-table';

import {
  MultiSelectColumnFilter,
  type MultiSelectFilterValue,
  type TanstackTableHeader,
  applyMultiSelectFilter,
} from '@prairielearn/ui';

import type { StaffStudentLabel } from '../lib/client/safe-db-types.js';

import { StudentLabelBadge } from './StudentLabelBadge.js';

export function StudentLabelsHeader() {
  return (
    <span className="d-inline-flex align-items-center gap-1">
      <span>Labels</span>
      <i className="bi bi-people" aria-hidden="true" />
    </span>
  );
}

export function StudentLabelsCell({
  labelIds,
  studentLabelsById,
}: {
  labelIds: string[];
  studentLabelsById: ReadonlyMap<string, StaffStudentLabel>;
}) {
  if (labelIds.length === 0) return '—';

  const labels = labelIds
    .map((id) => studentLabelsById.get(id))
    .filter((label): label is StaffStudentLabel => label != null);

  return (
    <div className="d-flex flex-wrap gap-1">
      {labels.map((label) => (
        <StudentLabelBadge key={label.id} label={label} />
      ))}
    </div>
  );
}

export function StudentLabelsFilter<TData extends RowData>({
  column,
  studentLabels,
}: {
  column: TanstackTableHeader<TData>['column'];
  studentLabels: StaffStudentLabel[];
}) {
  const studentLabelsById = new Map(studentLabels.map((label) => [label.id, label]));

  return (
    <MultiSelectColumnFilter
      column={column}
      allColumnValues={studentLabels.map((label) => label.id)}
      getSearchText={(value) => studentLabelsById.get(value)?.name ?? value}
      renderValueLabel={({ value }) => {
        const label = studentLabelsById.get(value);
        if (!label) return <span>{value}</span>;
        return <span>{label.name}</span>;
      }}
      showSearch
    />
  );
}

export function applyStudentLabelsFilter(
  labelIds: string[],
  filter: MultiSelectFilterValue,
): boolean {
  const labelIdSet = new Set(labelIds);
  return applyMultiSelectFilter(filter, (values) => values.some((id) => labelIdSet.has(id)));
}
