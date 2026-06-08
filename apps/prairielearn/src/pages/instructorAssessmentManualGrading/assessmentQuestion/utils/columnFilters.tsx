import {
  type ColumnFilter,
  MultiSelectColumnFilter,
  NumericInputColumnFilter,
} from '@prairielearn/ui';

import {
  GRADING_STATUS_VALUES,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
} from '../assessmentQuestion.types.js';

export function createColumnFilters({
  allGraders,
  allSubmissionGroups,
  allAiAgreementItems,
}: {
  allGraders: string[];
  allSubmissionGroups: string[];
  allAiAgreementItems: { number: number; description: string }[];
}) {
  return {
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
      />
    ),
    last_grader_name: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={[...allGraders, 'Unassigned']}
      />
    ),
    instance_question_group_name: ({ header }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={[...allSubmissionGroups, 'No group']}
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
  } satisfies Record<string, ColumnFilter<InstanceQuestionRow>>;
}
