import type { TanstackTableCsvCell } from '@prairielearn/ui';

import type { GradingJobInfo } from '../../../../ee/lib/ai-grading/types.js';
import type {
  StaffAssessment,
  StaffInstanceQuestionGroup,
  StaffStudentLabel,
  StaffUser,
} from '../../../../lib/client/safe-db-types.js';
import type { RubricItem } from '../../../../lib/db-types.js';
import type { RubricData } from '../../../../lib/manualGrading.types.js';
import type { InstanceQuestionRowWithAIGradingStats } from '../assessmentQuestion.types.js';

interface ExportOptions {
  assessment: Pick<StaffAssessment, 'team_work'>;
  studentLabels: StaffStudentLabel[];
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  rubricData: RubricData | null;
}

function userToExportFields(user: StaffUser | null) {
  return user ? { name: user.name, uid: user.uid, uin: user.uin, email: user.email } : null;
}

function rubricItemToExportFields(item: RubricItem) {
  return { rubric_item_id: item.id, description: item.description, points: item.points };
}

function gradingSourceToExportFields(source: GradingJobInfo['auto_points_source']) {
  return source
    ? {
        grading_job_id: source.grading_job.id,
        graded_at: source.grading_job.graded_at?.toISOString() ?? null,
        grader: userToExportFields(source.grader),
      }
    : null;
}

function gradingJobToExportFields(job: GradingJobInfo | null) {
  if (!job) return null;
  return {
    grading_job_id: job.grading_job.id,
    graded_at: job.grading_job.graded_at?.toISOString() ?? null,
    grader: userToExportFields(job.grader),
    auto_points: job.auto_points,
    manual_points: job.grading_job.manual_points,
    feedback: job.feedback,
    latest_update: gradingSourceToExportFields(job.latest_update),
    auto_points_source: gradingSourceToExportFields(job.auto_points_source),
    feedback_sources: Object.fromEntries(
      Object.entries(job.feedback_sources).map(([key, source]) => [
        key,
        gradingSourceToExportFields(source),
      ]),
    ),
    rubric: job.rubric_grading
      ? {
          ...job.rubric_grading,
          items: job.rubric_grading_items.map((item) => ({
            rubric_item_id: item.rubric_item_id,
            description: item.description,
            points: item.points,
            score: item.score,
          })),
        }
      : null,
  };
}

export function getManualGradingJsonData(
  row: InstanceQuestionRowWithAIGradingStats,
  { assessment, studentLabels, instanceQuestionGroups, rubricData }: ExportOptions,
) {
  const iq = row.instance_question;
  const submissionGroupId =
    iq.manual_instance_question_group_id ?? iq.ai_instance_question_group_id;
  const submissionGroup = instanceQuestionGroups.find((group) => group.id === submissionGroupId);

  return {
    instance_question_id: iq.id,
    ...(assessment.team_work
      ? {
          group: {
            name: row.user_or_group_name ?? null,
            members: row.group_members.map((member) => userToExportFields(member)),
          },
        }
      : {
          user: userToExportFields(row.user),
          student_labels: studentLabels
            .filter((label) => row.student_label_ids.includes(label.id))
            .map((label) => ({ id: label.id, name: label.name })),
        }),
    requires_manual_grading: iq.requires_manual_grading,
    assigned_grader: userToExportFields(row.assigned_grader),
    auto_points: iq.auto_points ?? null,
    manual_points: iq.manual_points ?? null,
    points: iq.points ?? null,
    score_perc: iq.score_perc ?? null,
    last_grader: userToExportFields(row.last_grader),
    modified_at: iq.modified_at.toISOString(),
    assessment_open: row.assessment_open,
    open_issue_count: row.open_issue_count ?? 0,
    max_auto_points: row.assessment_question.max_auto_points,
    max_manual_points: row.assessment_question.max_manual_points,
    max_points: row.assessment_question.max_points,
    submission_group: submissionGroupId
      ? {
          id: submissionGroupId,
          name: iq.instance_question_group_name,
          description: submissionGroup?.instance_question_group_description ?? null,
        }
      : null,
    rubric_grading_item_ids: row.rubric_grading_item_ids,
    rubric_items: (rubricData?.rubric_items ?? [])
      .filter(({ rubric_item }) => row.rubric_grading_item_ids.includes(rubric_item.id))
      .map(({ rubric_item }) => rubricItemToExportFields(rubric_item)),
    is_ai_graded: iq.is_ai_graded,
    human_grading: gradingJobToExportFields(iq.human_grading),
    ai_grading: gradingJobToExportFields(iq.ai_grading),
    ai_grading_status: iq.ai_grading_status,
    ai_grading_comparison: {
      points_ai_minus_human: iq.point_difference,
      rubric_difference:
        iq.rubric_difference?.map((item) => ({
          ...rubricItemToExportFields(item),
          selected_by_ai: item.false_positive,
          selected_by_human: !item.false_positive,
        })) ?? null,
      rubric_similarity:
        iq.rubric_similarity?.map((item) => ({
          ...rubricItemToExportFields(item),
          selected_by_ai: item.true_positive,
          selected_by_human: item.true_positive,
        })) ?? null,
    },
  };
}

export function getManualGradingCsvData(
  row: InstanceQuestionRowWithAIGradingStats,
  options: ExportOptions,
): TanstackTableCsvCell[] {
  const data = getManualGradingJsonData(row, options);
  const jsonCell = (value: unknown) => (value == null ? '' : JSON.stringify(value));

  return [
    { name: 'Instance', value: data.instance_question_id },
    {
      name: options.assessment.team_work ? 'Group Name' : 'Name',
      value: row.user_or_group_name || '',
    },
    { name: options.assessment.team_work ? 'UIDs' : 'UID', value: row.uid || '' },
    ...(options.assessment.team_work
      ? []
      : [
          { name: 'UIN', value: row.user?.uin ?? '' },
          { name: 'Email', value: row.user?.email ?? '' },
        ]),
    { name: 'Grading Status', value: data.requires_manual_grading ? 'Requires grading' : 'Graded' },
    { name: 'Assigned Grader Name', value: data.assigned_grader?.name ?? '' },
    { name: 'Assigned Grader UID', value: data.assigned_grader?.uid ?? '' },
    { name: 'Assigned Grader UIN', value: data.assigned_grader?.uin ?? '' },
    { name: 'Assigned Grader Email', value: data.assigned_grader?.email ?? '' },
    { name: 'Auto Points', value: data.auto_points?.toString() ?? '' },
    { name: 'Manual Points', value: data.manual_points?.toString() ?? '' },
    { name: 'Total Points', value: data.points?.toString() ?? '' },
    { name: 'Score %', value: data.score_perc?.toString() ?? '' },
    { name: 'Last Grader Name', value: data.last_grader?.name ?? '' },
    { name: 'Last Grader UID', value: data.last_grader?.uid ?? '' },
    { name: 'Last Grader UIN', value: data.last_grader?.uin ?? '' },
    { name: 'Last Grader Email', value: data.last_grader?.email ?? '' },
    { name: 'Modified At', value: data.modified_at },
    { name: 'Assessment Open', value: data.assessment_open.toString() },
    { name: 'Open Issue Count', value: data.open_issue_count },
    { name: 'Max Auto Points', value: data.max_auto_points },
    { name: 'Max Manual Points', value: data.max_manual_points },
    { name: 'Max Total Points', value: data.max_points },
    ...(!options.assessment.team_work
      ? [
          {
            name: 'Labels',
            value: 'student_labels' in data ? data.student_labels.map((label) => label.name) : [],
          },
        ]
      : []),
    { name: 'Submission Group', value: data.submission_group?.name ?? '' },
    { name: 'Submission Group Details', value: jsonCell(data.submission_group) },
    { name: 'Rubric Items', value: jsonCell(data.rubric_items) },
    { name: 'Rubric Item IDs', value: jsonCell(data.rubric_grading_item_ids) },
    { name: 'Is AI Graded', value: data.is_ai_graded.toString() },
    { name: 'Human Manual Points', value: data.human_grading?.manual_points ?? '' },
    { name: 'Human Grading', value: jsonCell(data.human_grading) },
    { name: 'AI Manual Points', value: data.ai_grading?.manual_points ?? '' },
    { name: 'AI Grading', value: jsonCell(data.ai_grading) },
    { name: 'AI Grading Status', value: data.ai_grading_status },
    {
      name: 'Point Difference (AI - Human)',
      value: data.ai_grading_comparison.points_ai_minus_human ?? '',
    },
    { name: 'Rubric Difference', value: jsonCell(data.ai_grading_comparison.rubric_difference) },
    { name: 'Rubric Similarity', value: jsonCell(data.ai_grading_comparison.rubric_similarity) },
  ];
}
