import type { Header } from '@tanstack/react-table';

import {
  CategoricalColumnFilter,
  MultiSelectColumnFilter,
  NumericInputColumnFilter,
} from '@prairielearn/ui';

import { type InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow } from '../assessmentQuestion.types.js';

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
    requires_manual_grading: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, 'Requires manual grading' | 'Graded'>;
    }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={['Requires grading', 'Graded']}
      />
    ),
    assigned_grader_name: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, InstanceQuestionRow['assigned_grader_name']>;
    }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={[...allGraders, 'Unassigned']}
      />
    ),
    last_grader_name: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, InstanceQuestionRow['last_grader_name']>;
    }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={[...allGraders, 'Unassigned']}
      />
    ),
    instance_question_group_name: ({
      header,
    }: {
      header: Header<
        InstanceQuestionRow,
        InstanceQuestionRow['instance_question']['instance_question_group_name']
      >;
    }) => (
      <CategoricalColumnFilter
        column={header.column}
        allColumnValues={[...allSubmissionGroups, 'No group']}
      />
    ),
    manual_points: ({
      header,
    }: {
      header: Header<
        InstanceQuestionRow,
        InstanceQuestionRow['instance_question']['manual_points']
      >;
    }) => <NumericInputColumnFilter column={header.column} />,
    auto_points: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, InstanceQuestionRow['instance_question']['auto_points']>;
    }) => <NumericInputColumnFilter column={header.column} />,
    points: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, InstanceQuestionRow['instance_question']['points']>;
    }) => <NumericInputColumnFilter column={header.column} />,
    score_perc: ({
      header,
    }: {
      header: Header<InstanceQuestionRow, InstanceQuestionRow['instance_question']['score_perc']>;
    }) => <NumericInputColumnFilter column={header.column} />,
    rubric_difference: ({ header }: { header: Header<InstanceQuestionRow, string> }) => (
      <MultiSelectColumnFilter
        column={header.column}
        allColumnValues={allAiAgreementItems.map((item) => item.description)}
      />
    ),
  };
}
