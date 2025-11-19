import type { Header } from '@tanstack/react-table';

import {
  CategoricalColumnFilter,
  MultiSelectColumnFilter,
  type NumericColumnFilterValue,
  NumericInputColumnFilter,
} from '@prairielearn/ui';

import {
  GRADING_STATUS_VALUES,
  type GradingStatusValue,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
} from '../assessmentQuestion.types.js';

interface CreateColumnFiltersParams {
  allGraders: string[];
  allSubmissionGroups: string[];
  allAiAgreementItems: { number: number; description: string }[];
  gradingStatusFilter: GradingStatusValue[];
  setGradingStatusFilter: (
    value:
      | GradingStatusValue[]
      | null
      | ((prev: GradingStatusValue[]) => GradingStatusValue[] | null),
  ) => Promise<URLSearchParams>;
  assignedGraderFilter: string[];
  setAssignedGraderFilter: (
    value: string[] | null | ((prev: string[]) => string[] | null),
  ) => Promise<URLSearchParams>;
  gradedByFilter: string[];
  setGradedByFilter: (
    value: string[] | null | ((prev: string[]) => string[] | null),
  ) => Promise<URLSearchParams>;
  submissionGroupFilter: string[];
  setSubmissionGroupFilter: (
    value: string[] | null | ((prev: string[]) => string[] | null),
  ) => Promise<URLSearchParams>;
  aiAgreementFilter: string[];
  setAiAgreementFilter: (
    value: string[] | null | ((prev: string[]) => string[] | null),
  ) => Promise<URLSearchParams>;
  manualPointsFilter: NumericColumnFilterValue;
  setManualPointsFilter: (
    value:
      | NumericColumnFilterValue
      | ((prev: NumericColumnFilterValue) => NumericColumnFilterValue),
  ) => Promise<URLSearchParams>;
  autoPointsFilter: NumericColumnFilterValue;
  setAutoPointsFilter: (
    value:
      | NumericColumnFilterValue
      | ((prev: NumericColumnFilterValue) => NumericColumnFilterValue),
  ) => Promise<URLSearchParams>;
  totalPointsFilter: NumericColumnFilterValue;
  setTotalPointsFilter: (
    value:
      | NumericColumnFilterValue
      | ((prev: NumericColumnFilterValue) => NumericColumnFilterValue),
  ) => Promise<URLSearchParams>;
  scoreFilter: NumericColumnFilterValue;
  setScoreFilter: (
    value:
      | NumericColumnFilterValue
      | ((prev: NumericColumnFilterValue) => NumericColumnFilterValue),
  ) => Promise<URLSearchParams>;
}

export function createColumnFilters({
  allGraders,
  allSubmissionGroups,
  allAiAgreementItems,
  gradingStatusFilter,
  setGradingStatusFilter,
  assignedGraderFilter,
  setAssignedGraderFilter,
  gradedByFilter,
  setGradedByFilter,
  submissionGroupFilter,
  setSubmissionGroupFilter,
  aiAgreementFilter,
  setAiAgreementFilter,
  manualPointsFilter,
  setManualPointsFilter,
  autoPointsFilter,
  setAutoPointsFilter,
  totalPointsFilter,
  setTotalPointsFilter,
  scoreFilter,
  setScoreFilter,
}: CreateColumnFiltersParams) {
  return {
    requires_manual_grading: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Status"
        allColumnValues={GRADING_STATUS_VALUES}
        columnValuesFilter={gradingStatusFilter}
        setColumnValuesFilter={setGradingStatusFilter}
      />
    ),
    assigned_grader_name: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Assigned grader"
        allColumnValues={[...allGraders, 'Unassigned']}
        columnValuesFilter={assignedGraderFilter}
        setColumnValuesFilter={setAssignedGraderFilter}
      />
    ),
    last_grader_name: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Graded by"
        allColumnValues={[...allGraders, 'Unassigned']}
        columnValuesFilter={gradedByFilter}
        setColumnValuesFilter={setGradedByFilter}
      />
    ),
    instance_question_group_name: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, unknown>;
    }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Submission group"
        allColumnValues={[...allSubmissionGroups, 'No group']}
        columnValuesFilter={submissionGroupFilter}
        setColumnValuesFilter={setSubmissionGroupFilter}
      />
    ),
    manual_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter
        columnId={header.column.id}
        columnLabel="Manual points"
        value={manualPointsFilter}
        onChange={setManualPointsFilter}
      />
    ),
    auto_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter
        columnId={header.column.id}
        columnLabel="Auto points"
        value={autoPointsFilter}
        onChange={setAutoPointsFilter}
      />
    ),
    points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter
        columnId={header.column.id}
        columnLabel="Total points"
        value={totalPointsFilter}
        onChange={setTotalPointsFilter}
      />
    ),
    score_perc: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter
        columnId={header.column.id}
        columnLabel="Score"
        value={scoreFilter}
        onChange={setScoreFilter}
      />
    ),
    rubric_difference: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <MultiSelectColumnFilter
        columnId={header.column.id}
        columnLabel="AI disagreements"
        allColumnValues={allAiAgreementItems.map((item) => item.description)}
        columnValuesFilter={aiAgreementFilter}
        setColumnValuesFilter={setAiAgreementFilter}
      />
    ),
  };
}
