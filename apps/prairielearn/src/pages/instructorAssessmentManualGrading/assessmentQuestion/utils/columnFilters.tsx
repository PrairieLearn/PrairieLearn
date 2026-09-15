import type { ReactNode } from 'react';

import {
  MultiSelectColumnFilter,
  NumericInputColumnFilter,
  type TanstackTableHeader,
} from '@prairielearn/ui';

import type { StaffStudentLabel } from '../../../../lib/client/safe-db-types.js';
import {
  GRADING_STATUS_VALUES,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
} from '../assessmentQuestion.types.js';

type ColumnFilter = (props: { header: TanstackTableHeader<InstanceQuestionRow> }) => ReactNode;

export function createColumnFilters({
  allGraders,
  studentLabels,
  allSubmissionGroups,
  allAiAgreementItems,
}: {
  allGraders: string[];
  studentLabels: StaffStudentLabel[];
  allSubmissionGroups: string[];
  allAiAgreementItems: { number: number; description: string }[];
}) {
  const studentLabelsById = new Map(studentLabels.map((label) => [label.id, label]));
  return {
    student_labels: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={studentLabels.map((label) => label.id)}
        getSearchText={(value) => studentLabelsById.get(value)?.name ?? value}
        renderValueLabel={({ value }) => {
          const label = studentLabelsById.get(value);
          if (!label) return <span>{value}</span>;
          return <span>{label.name}</span>;
        }}
        showSearch
      />
    ),
    requires_manual_grading: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={[...GRADING_STATUS_VALUES]}
      />
    ),
    assigned_grader_name: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={[...allGraders, 'Unassigned']}
        showSearch
      />
    ),
    last_grader_name: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={[...allGraders, 'Unassigned']}
        showSearch
      />
    ),
    instance_question_group_name: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={[...allSubmissionGroups, 'No group']}
        showSearch
      />
    ),
    manual_points: ({ header }) => <NumericInputColumnFilter column={header.column} />,
    auto_points: ({ header }) => <NumericInputColumnFilter column={header.column} />,
    points: ({ header }) => <NumericInputColumnFilter column={header.column} />,
    score_perc: ({ header }) => <NumericInputColumnFilter column={header.column} />,
    rubric_difference: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={allAiAgreementItems.map((item) => item.description)}
      />
    ),
  } satisfies Record<string, ColumnFilter>;
}
