import type { Header } from '@tanstack/react-table';

import {
  CategoricalColumnFilter,
  MultiSelectColumnFilter,
  NumericInputColumnFilter,
} from '@prairielearn/ui';

import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../../lib/db-types.js';
import {
  GRADING_STATUS_VALUES,
  type GradingStatusValue,
  type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow,
} from '../assessmentQuestion.types.js';

interface CreateColumnFiltersParams {
  allGraders: string[];
  allSubmissionGroups: string[];
  allAiAgreementItems: { number: number; description: string }[];
  aiGradingMode: boolean;
  instanceQuestionGroups: InstanceQuestionGroup[];
  assessmentQuestion: AssessmentQuestion;
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
  manualPointsFilter: string;
  setManualPointsFilter: (
    value: string | null | ((prev: string) => string | null),
  ) => Promise<URLSearchParams>;
  autoPointsFilter: string;
  setAutoPointsFilter: (
    value: string | null | ((prev: string) => string | null),
  ) => Promise<URLSearchParams>;
  totalPointsFilter: string;
  setTotalPointsFilter: (
    value: string | null | ((prev: string) => string | null),
  ) => Promise<URLSearchParams>;
  scoreFilter: string;
  setScoreFilter: (
    value: string | null | ((prev: string) => string | null),
  ) => Promise<URLSearchParams>;
}

export function createColumnFilters({
  allGraders,
  allSubmissionGroups,
  allAiAgreementItems,
  aiGradingMode,
  instanceQuestionGroups,
  assessmentQuestion,
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
        renderValueLabel={({ value }) => <span>{value}</span>}
        columnValuesFilter={gradingStatusFilter}
        setColumnValuesFilter={setGradingStatusFilter}
      />
    ),
    assigned_grader_name: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Assigned Grader"
        allColumnValues={[...allGraders, 'Unassigned']}
        renderValueLabel={({ value }) => <span>{value}</span>}
        columnValuesFilter={assignedGraderFilter}
        setColumnValuesFilter={setAssignedGraderFilter}
      />
    ),
    last_grader_name: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <CategoricalColumnFilter
        columnId={header.column.id}
        columnLabel="Graded By"
        allColumnValues={[...allGraders, 'Unassigned']}
        renderValueLabel={({ value }) => <span>{value}</span>}
        columnValuesFilter={gradedByFilter}
        setColumnValuesFilter={setGradedByFilter}
      />
    ),
    ...(aiGradingMode && instanceQuestionGroups.length > 0
      ? {
          instance_question_group_name: ({
            header,
          }: {
            header: Header<InstanceQuestionRow, unknown>;
          }) => (
            <CategoricalColumnFilter
              columnId={header.column.id}
              columnLabel="Submission Group"
              allColumnValues={[...allSubmissionGroups, 'No Group']}
              renderValueLabel={({ value }) => <span>{value}</span>}
              columnValuesFilter={submissionGroupFilter}
              setColumnValuesFilter={setSubmissionGroupFilter}
            />
          ),
        }
      : {}),
    manual_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter
        columnId={header.column.id}
        columnLabel="Manual Points"
        value={manualPointsFilter}
        onChange={setManualPointsFilter}
      />
    ),
    ...(assessmentQuestion.max_auto_points && assessmentQuestion.max_auto_points > 0
      ? {
          auto_points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
            <NumericInputColumnFilter
              columnId={header.column.id}
              columnLabel="Auto Points"
              value={autoPointsFilter}
              onChange={setAutoPointsFilter}
            />
          ),
        }
      : {}),
    points: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
      <NumericInputColumnFilter
        columnId={header.column.id}
        columnLabel="Total Points"
        value={totalPointsFilter}
        onChange={setTotalPointsFilter}
      />
    ),
    ...(!aiGradingMode
      ? {
          score_perc: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
            <NumericInputColumnFilter
              columnId={header.column.id}
              columnLabel="Score"
              value={scoreFilter}
              onChange={setScoreFilter}
            />
          ),
        }
      : {}),
    ...(aiGradingMode
      ? {
          rubric_difference: ({ header }: { header: Header<InstanceQuestionRow, unknown> }) => (
            <MultiSelectColumnFilter
              columnId={header.column.id}
              columnLabel="AI Disagreements"
              allColumnValues={allAiAgreementItems.map((item) => item.description)}
              renderValueLabel={({ value }) => {
                return <span>{value}</span>;
              }}
              columnValuesFilter={aiAgreementFilter}
              setColumnValuesFilter={setAiAgreementFilter}
            />
          ),
        }
      : {}),
  };
}
