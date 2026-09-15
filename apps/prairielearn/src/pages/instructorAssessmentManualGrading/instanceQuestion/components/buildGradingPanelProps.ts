import assert from 'assert';

import { markdownToHtml } from '@prairielearn/markdown';
import { run } from '@prairielearn/run';

import type { InstanceQuestionAIGradingInfo } from '../../../../ee/lib/ai-grading/types.js';
import { getAssessmentManualGradingUrl } from '../../../../lib/client/url.js';
import type { InstanceQuestionGroup, User } from '../../../../lib/db-types.js';
import { safeMustacheRender } from '../../../../lib/mustache.js';
import type { ResLocalsInstanceQuestionRender } from '../../../../lib/question-render.types.js';
import type { ResLocalsForPage } from '../../../../lib/res-locals.js';

import type { GradingPanelGroup, GradingPanelProps } from './gradingPanel.types.js';

export function buildGradingPanelProps({
  resLocals,
  context,
  graders,
  disable,
  skip_text,
  custom_points,
  custom_auto_points,
  custom_manual_points,
  grading_job,
  aiGradingInfo,
  aiGradingMode = false,
  showInstanceQuestionGroup = false,
  selectedInstanceQuestionGroup = null,
  instanceQuestionGroups,
  skip_graded_submissions,
  show_submissions_assigned_to_me_only,
  gradedByHumanName = null,
  enable_single_key_shortcuts,
}: {
  resLocals: ResLocalsForPage<'instance-question'> & ResLocalsInstanceQuestionRender;
  context: GradingPanelProps['context'];
  graders?: User[] | null;
  disable?: boolean;
  skip_text?: string;
  custom_points?: number;
  custom_auto_points?: number;
  custom_manual_points?: number;
  grading_job?: { feedback: Record<string, any> | null } | null;
  aiGradingInfo?: InstanceQuestionAIGradingInfo;
  aiGradingMode?: boolean;
  showInstanceQuestionGroup?: boolean;
  selectedInstanceQuestionGroup?: InstanceQuestionGroup | null;
  instanceQuestionGroups?: InstanceQuestionGroup[];
  skip_graded_submissions?: boolean;
  show_submissions_assigned_to_me_only?: boolean;
  gradedByHumanName?: string | null;
  enable_single_key_shortcuts: boolean;
}): GradingPanelProps {
  const auto_points = custom_auto_points ?? resLocals.instance_question.auto_points ?? 0;
  const manual_points = custom_manual_points ?? resLocals.instance_question.manual_points ?? 0;
  const points = custom_points ?? resLocals.instance_question.points ?? 0;
  const submission = grading_job ?? resLocals.submission;

  assert(submission, 'submission is missing');
  assert(resLocals.submission, 'resLocals.submission is missing');

  const canEdit = resLocals.authz_data.has_course_instance_permission_edit;
  disable = disable || !canEdit;

  const emptyGroup: GradingPanelGroup = {
    id: null,
    instance_question_group_name: 'No group',
    instance_question_group_description: 'No group assigned.',
  };

  const displayedSelectedGroup: GradingPanelGroup = selectedInstanceQuestionGroup
    ? {
        id: selectedInstanceQuestionGroup.id,
        instance_question_group_name: selectedInstanceQuestionGroup.instance_question_group_name,
        instance_question_group_description:
          selectedInstanceQuestionGroup.instance_question_group_description,
      }
    : emptyGroup;

  const groups: GradingPanelGroup[] = [
    ...(instanceQuestionGroups ?? []).map((group) => ({
      id: group.id,
      instance_question_group_name: group.instance_question_group_name,
      instance_question_group_description: group.instance_question_group_description,
    })),
    emptyGroup,
  ];

  const graderGuidelines = resLocals.rubric_data?.rubric.grader_guidelines;
  const mustacheParams = {
    correct_answers: resLocals.submission.true_answer ?? {},
    params: resLocals.submission.params ?? {},
    submitted_answers: resLocals.submission.submitted_answer,
  };
  const graderGuidelinesHtml = run(() => {
    if (!graderGuidelines) return null;
    const { rendered, error } = safeMustacheRender(graderGuidelines, mustacheParams);
    const renderedHtml = markdownToHtml(rendered);
    if (!error) return renderedHtml;
    return `${renderedHtml} <span class="text-danger small">(template error: ${error})</span>`;
  });

  return {
    context,
    csrfToken: resLocals.__csrf_token,
    modifiedAt: resLocals.instance_question.modified_at.toISOString(),
    submissionId: resLocals.submission.id,
    maxAutoPoints: resLocals.assessment_question.max_auto_points ?? 0,
    maxManualPoints: resLocals.assessment_question.max_manual_points ?? 0,
    maxPoints: resLocals.assessment_question.max_points,
    autoPoints: auto_points,
    manualPoints: manual_points,
    points,
    rubricData: resLocals.rubric_data ?? null,
    selectedRubricItemIds: Object.entries(resLocals.submission.rubric_grading?.rubric_items ?? {})
      .filter(([, item]) => item.score)
      .map(([id]) => id),
    adjustPoints: resLocals.submission.rubric_grading?.adjust_points ?? 0,
    graderGuidelinesHtml,
    feedback: submission.feedback?.manual ?? '',
    openIssues: resLocals.issues.filter((issue) => issue.open).map((issue) => ({ id: issue.id })),
    graders: (graders ?? []).map((grader) => ({
      id: grader.id,
      name: grader.name,
      uid: grader.uid,
    })),
    disable,
    skipText: skip_text || 'Next',
    aiGradingMode,
    aiGradingInfo,
    showInstanceQuestionGroup,
    selectedInstanceQuestionGroup: displayedSelectedGroup,
    instanceQuestionGroups: groups,
    skipGradedSubmissions: skip_graded_submissions ?? true,
    showSubmissionsAssignedToMeOnly: canEdit
      ? (show_submissions_assigned_to_me_only ?? true)
      : false,
    gradedByHumanName,
    enableSingleKeyShortcuts: enable_single_key_shortcuts,
    manualInstanceQuestionGroupUrl: showInstanceQuestionGroup
      ? `${getAssessmentManualGradingUrl({
          courseInstanceId: resLocals.course_instance.id,
          assessmentId: resLocals.assessment.id,
        })}/instance_question/${resLocals.instance_question.id}/manual_instance_question_group`
      : null,
  };
}
