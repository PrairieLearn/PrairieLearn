import type { Header } from '@tanstack/react-table';

import {
  CategoricalColumnFilter,
  MultiSelectColumnFilter,
  NumericInputColumnFilter,
} from '@prairielearn/ui';

import {
  GRADING_STATUS_VALUES,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
} from '../assessmentQuestion.types.js';

interface CreateColumnFiltersParams {
  allGraders: string[];
  allSubmissionGroups: string[];
  allAiAgreementItems: { number: number; description: string }[];
}

export function createColumnFilters({
  allGraders,
  allSubmissionGroups,
  allAiAgreementItems,
}: CreateColumnFiltersParams) {
  return {
    requires_manual_grading: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        header={header}
        columnLabel="Status"
        allColumnValues={GRADING_STATUS_VALUES}
      />
    ),
    assigned_grader_name: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        header={header}
        columnLabel="Assigned grader"
        allColumnValues={[...allGraders, 'Unassigned']}
      />
    ),
    last_grader_name: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        header={header}
        columnLabel="Graded by"
        allColumnValues={[...allGraders, 'Unassigned']}
      />
    ),
    instance_question_group_name: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, unknown>;
    }) => (
      <CategoricalColumnFilter
        header={header}
        columnLabel="Submission group"
        allColumnValues={[...allSubmissionGroups, 'No group']}
      />
    ),
    manual_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter header={header} columnLabel="Manual points" />
    ),
    auto_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter header={header} columnLabel="Auto points" />
    ),
    points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter header={header} columnLabel="Total points" />
    ),
    score_perc: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter header={header} columnLabel="Score" />
    ),
    rubric_difference: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <MultiSelectColumnFilter
        header={header}
        columnLabel="AI disagreements"
        allColumnValues={allAiAgreementItems.map((item) => item.description)}
      />
    ),
  };
}
