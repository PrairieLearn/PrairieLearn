import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import {
  RegenerateInstanceAlert,
  RegenerateInstanceModal,
} from '../../components/AssessmentRegenerate.js';
import { GroupWorkInfoContainer } from '../../components/GroupWorkInfoContainer.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../components/PersonalNotesPanel.js';
import {
  ExamQuestionAvailablePoints,
  ExamQuestionStatus,
  InstanceQuestionPoints,
  QuestionVariantHistory,
} from '../../components/QuestionScore.js';
import { StudentAccessRulesPopover } from '../../components/StudentAccessRulesPopover.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  AssessmentQuestionSchema,
  EnumQuestionAccessModeSchema,
  type GroupConfig,
  InstanceQuestionSchema,
  QuestionSchema,
} from '../../lib/db-types.js';
import { formatPoints } from '../../lib/format.js';
import { type GroupInfo, getRoleNamesForUser } from '../../lib/groups.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { SimpleVariantWithScoreSchema } from '../../models/variant.js';

import { StudentAssessmentInstanceBody } from './components/StudentAssessmentInstanceBody.js';
import {
  type ClientQuestionRow,
  type RowRenderedHtml,
  StudentAssessmentInstanceSchema,
} from './components/types.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  start_new_zone: z.boolean(),
  zone_id: IdSchema,
  zone_number: z.number(),
  zone_title: z.string().nullable(),
  lockpoint: z.boolean(),
  lockpoint_crossed: z.boolean(),
  lockpoint_crossed_at: DateFromISOString.nullable(),
  lockpoint_crossed_authn_user_uid: z.string().nullable(),
  question_title: QuestionSchema.shape.title,
  max_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  init_points: z.number().nullable(),
  grade_rate_minutes: AssessmentQuestionSchema.shape.grade_rate_minutes,
  allow_real_time_grading: AssessmentQuestionSchema.shape.allow_real_time_grading,
  row_order: z.number(),
  question_number: z.string(),
  zone_max_points: z.number().nullable(),
  zone_has_max_points: z.boolean(),
  zone_best_questions: z.number().nullable(),
  zone_has_best_questions: z.boolean(),
  zone_question_count: z.number(),
  file_count: z.number(),
  question_access_mode: EnumQuestionAccessModeSchema,
  prev_advance_score_perc: z.number().nullable(),
  prev_title: z.string().nullable(),
  prev_question_access_mode: EnumQuestionAccessModeSchema.nullable(),
  allowGradeLeftMs: z.number().default(0),
  previous_variants: z.array(SimpleVariantWithScoreSchema).optional(),
  group_role_permissions: z
    .object({
      can_view: z.boolean(),
      can_submit: z.boolean(),
    })
    .optional(),
});
type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export function StudentAssessmentInstance({
  instance_question_rows,
  showTimeLimitExpiredModal,
  groupConfig,
  groupInfo,
  userCanAssignRoles,
  userCanDeleteAssessmentInstance,
  resLocals,
}: {
  instance_question_rows: InstanceQuestionRow[];
  showTimeLimitExpiredModal: boolean;
  userCanDeleteAssessmentInstance: boolean;
  resLocals: ResLocalsForPage<'assessment-instance'> & {
    has_manual_grading_question: boolean;
    has_auto_grading_question: boolean;
    assessment_text_templated: string | null;
  };
} & (
  | {
      groupConfig: GroupConfig;
      groupInfo: GroupInfo;
      userCanAssignRoles: boolean;
    }
  | {
      groupConfig?: undefined;
      groupInfo?: undefined;
      userCanAssignRoles?: undefined;
    }
)) {
  let savedAnswers = 0;
  let suspendedSavedAnswers = 0;

  const someQuestionsAllowRealTimeGrading = instance_question_rows.some(
    (q) => q.allow_real_time_grading,
  );
  const someQuestionsForbidRealTimeGrading = instance_question_rows.some(
    (q) => !q.allow_real_time_grading,
  );

  instance_question_rows.forEach((question) => {
    if (question.status === 'saved') {
      if (question.allowGradeLeftMs > 0) {
        suspendedSavedAnswers++;
      } else if (
        (question.max_auto_points || !question.max_manual_points) &&
        question.allow_real_time_grading
      ) {
        savedAnswers++;
      }
    }
  });

  const zoneTitleColspan = run(() => {
    const trailingColumnsCount =
      resLocals.assessment.type === 'Exam'
        ? resLocals.has_auto_grading_question && someQuestionsAllowRealTimeGrading
          ? 2
          : resLocals.has_auto_grading_question && resLocals.has_manual_grading_question
            ? 3
            : 1
        : (resLocals.has_auto_grading_question ? 2 : 0) + 1;

    return resLocals.assessment.type === 'Exam'
      ? resLocals.has_auto_grading_question &&
        resLocals.has_manual_grading_question &&
        someQuestionsAllowRealTimeGrading
        ? 6
        : 2 + trailingColumnsCount
      : resLocals.has_auto_grading_question && resLocals.has_manual_grading_question
        ? 6
        : 1 + trailingColumnsCount;
  });

  const userGroupRoles = groupInfo
    ? getRoleNamesForUser(groupInfo, resLocals.authz_data.user).join(', ')
    : null;

  const firstUncrossedLockpointZoneNumber = instance_question_rows
    .filter((row) => row.start_new_zone && row.lockpoint && !row.lockpoint_crossed)
    .map((row) => row.zone_number)
    .sort((a, b) => a - b)[0];

  // Pre-render shared HTML-template components for the question table cells.
  const rowRenderedHtml: RowRenderedHtml[] = instance_question_rows.map((row) => {
    const rendered: RowRenderedHtml = {};

    if (resLocals.assessment.type === 'Exam') {
      if (row.question_access_mode === 'blocked_lockpoint') {
        rendered.statusHtml = '<span class="badge text-bg-secondary">Locked</span>';
      } else {
        rendered.statusHtml = ExamQuestionStatus({
          instance_question: row,
          assessment_question: row,
          realTimeGradingPartiallyDisabled:
            someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading,
          allowGradeLeftMs: row.allowGradeLeftMs,
        }).toString();
      }

      if (resLocals.has_auto_grading_question && someQuestionsAllowRealTimeGrading) {
        rendered.availablePointsHtml = row.max_auto_points
          ? ExamQuestionAvailablePoints({
              open: (resLocals.assessment_instance.open && row.open) ?? false,
              currentWeight:
                (row.points_list_original?.[row.number_attempts] ?? 0) -
                (row.max_manual_points ?? 0),
              pointsList: row.points_list?.map((p) => p - (row.max_manual_points ?? 0)),
              highestSubmissionScore: row.highest_submission_score,
            }).toString()
          : '&mdash;';
      }

      if (someQuestionsAllowRealTimeGrading || !resLocals.assessment_instance.open) {
        if (resLocals.has_auto_grading_question && resLocals.has_manual_grading_question) {
          rendered.autoPointsHtml = InstanceQuestionPoints({
            instance_question: row,
            assessment_question: row,
            component: 'auto',
          }).toString();
          rendered.manualPointsHtml = InstanceQuestionPoints({
            instance_question: row,
            assessment_question: row,
            component: 'manual',
          }).toString();
        }
        rendered.totalPointsHtml = InstanceQuestionPoints({
          instance_question: row,
          assessment_question: row,
          component: 'total',
        }).toString();
      } else {
        if (resLocals.has_auto_grading_question && resLocals.has_manual_grading_question) {
          rendered.autoPointsHtml = formatPoints(row.max_auto_points);
          rendered.manualPointsHtml = formatPoints(row.max_manual_points);
        }
        rendered.totalPointsHtml = formatPoints(row.max_points);
      }
    } else {
      // Homework
      if (resLocals.has_auto_grading_question) {
        if (!row.max_auto_points) {
          rendered.availablePointsHtml = '&mdash;';
        } else {
          const currentAutoValue = (row.current_value ?? 0) - (row.max_manual_points ?? 0);
          rendered.availablePointsHtml = formatPoints(currentAutoValue);
        }
        rendered.variantHistoryHtml = QuestionVariantHistory({
          urlPrefix: resLocals.urlPrefix,
          instanceQuestionId: row.id,
          previousVariants: row.previous_variants,
        }).toString();
      }

      if (resLocals.has_auto_grading_question && resLocals.has_manual_grading_question) {
        rendered.autoPointsHtml = InstanceQuestionPoints({
          instance_question: row,
          assessment_question: row,
          component: 'auto',
        }).toString();
        rendered.manualPointsHtml = InstanceQuestionPoints({
          instance_question: row,
          assessment_question: row,
          component: 'manual',
        }).toString();
      }
      rendered.totalPointsHtml = InstanceQuestionPoints({
        instance_question: row,
        assessment_question: row,
        component: 'total',
      }).toString();
    }

    return rendered;
  });

  // Pre-render other shared HTML-template components.
  const accessRulesPopoverHtml = StudentAccessRulesPopover({
    accessRules: resLocals.authz_result.access_rules,
  }).toString();

  const groupWorkInfoHtml =
    groupConfig != null
      ? GroupWorkInfoContainer({
          groupConfig,
          groupInfo,
          userCanAssignRoles,
          csrfToken: resLocals.__csrf_token,
        }).toString()
      : null;

  // Map rows to client-safe type (no db-types.ts references).
  const isGroupAssessment = groupConfig != null;
  const questionRows: ClientQuestionRow[] = instance_question_rows.map((row) => ({
    id: row.id,
    startNewZone: row.start_new_zone,
    zoneId: row.zone_id,
    zoneNumber: row.zone_number,
    zoneTitle: row.zone_title,
    lockpoint: row.lockpoint,
    lockpointCrossed: row.lockpoint_crossed,
    lockpointCrossedInfo: run(() => {
      if (!row.lockpoint_crossed) return null;
      const parts: string[] = ['Previous questions locked'];
      if (isGroupAssessment && row.lockpoint_crossed_authn_user_uid) {
        parts.push(`by ${row.lockpoint_crossed_authn_user_uid}`);
      }
      if (row.lockpoint_crossed_at) {
        parts.push(
          `at ${formatDate(row.lockpoint_crossed_at, resLocals.course_instance.display_timezone)}`,
        );
      }
      return parts.join(' ');
    }),
    questionNumber: row.question_number,
    questionTitle: row.question_title,
    questionAccessMode: row.question_access_mode,
    prevAdvanceScorePerc: row.prev_advance_score_perc,
    prevTitle: row.prev_title,
    prevQuestionAccessMode: row.prev_question_access_mode,
    groupRolePermissions: row.group_role_permissions
      ? {
          canView: row.group_role_permissions.can_view,
          canSubmit: row.group_role_permissions.can_submit,
        }
      : undefined,
    fileCount: row.file_count,
    zoneMaxPoints: row.zone_max_points,
    zoneHasMaxPoints: row.zone_has_max_points,
    zoneBestQuestions: row.zone_best_questions,
    zoneHasBestQuestions: row.zone_has_best_questions,
    zoneQuestionCount: row.zone_question_count,
  }));

  const allQuestionsAnswered = instance_question_rows.every((iq) => iq.status !== 'unanswered');
  const assessmentInstance = StudentAssessmentInstanceSchema.parse(resLocals.assessment_instance);

  return PageLayout({
    resLocals,
    pageTitle: '',
    navContext: {
      type: 'student',
      page: 'assessment_instance',
    },
    headContent: html`
      ${resLocals.assessment.type === 'Exam'
        ? html`${compiledScriptTag('examTimeLimitCountdown.ts')}
          ${EncodedData(
            {
              serverRemainingMS: resLocals.assessment_instance_remaining_ms,
              serverTimeLimitMS: resLocals.assessment_instance_time_limit_ms,
              serverUpdateURL: `${resLocals.urlPrefix}/assessment_instance/${resLocals.assessment_instance.id}/time_remaining`,
              canTriggerFinish: resLocals.authz_result.authorized_edit,
              showsTimeoutWarning: true,
              reloadOnFail: true,
              csrfToken: resLocals.__csrf_token,
            },
            'time-limit-data',
          )}`
        : ''}
    `,
    preContent: userCanDeleteAssessmentInstance
      ? RegenerateInstanceModal({ csrfToken: resLocals.__csrf_token })
      : '',
    content: (
      <>
        {userCanDeleteAssessmentInstance && (
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          <div dangerouslySetInnerHTML={{ __html: RegenerateInstanceAlert().toString() }} />
        )}
        <Hydrate>
          <StudentAssessmentInstanceBody
            assessmentType={resLocals.assessment.type}
            assessmentSetAbbreviation={resLocals.assessment_set.abbreviation}
            assessmentNumber={resLocals.assessment.number}
            assessmentTitle={resLocals.assessment.title}
            isTeamWork={!!resLocals.assessment.team_work}
            assessmentInstance={assessmentInstance}
            remainingMs={resLocals.assessment_instance_remaining_ms ?? null}
            active={!!resLocals.authz_result.active}
            authorizedEdit={!!resLocals.authz_result.authorized_edit}
            creditDateString={resLocals.authz_result.credit_date_string}
            password={resLocals.authz_result.password ?? null}
            showClosedAssessment={!!resLocals.authz_result.show_closed_assessment}
            hasManualGradingQuestion={resLocals.has_manual_grading_question}
            hasAutoGradingQuestion={resLocals.has_auto_grading_question}
            someQuestionsAllowRealTimeGrading={someQuestionsAllowRealTimeGrading}
            someQuestionsForbidRealTimeGrading={someQuestionsForbidRealTimeGrading}
            assessmentTextHtml={resLocals.assessment_text_templated}
            accessRulesPopoverHtml={accessRulesPopoverHtml}
            groupWorkInfoHtml={groupWorkInfoHtml}
            questionRows={questionRows}
            rowRenderedHtml={rowRenderedHtml}
            savedAnswers={savedAnswers}
            suspendedSavedAnswers={suspendedSavedAnswers}
            zoneTitleColspan={zoneTitleColspan}
            firstUncrossedLockpointZoneNumber={firstUncrossedLockpointZoneNumber}
            allQuestionsAnswered={allQuestionsAnswered}
            urlPrefix={resLocals.urlPrefix}
            csrfToken={resLocals.__csrf_token}
            userGroupRoles={userGroupRoles}
            isGroupAssessment={isGroupAssessment}
            showTimeLimitExpiredModal={showTimeLimitExpiredModal}
          />
        </Hydrate>
        {resLocals.assessment.allow_personal_notes && (
          <div
            // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
            dangerouslySetInnerHTML={{
              __html: PersonalNotesPanel({
                fileList: resLocals.file_list,
                context: 'assessment',
                courseInstanceId: resLocals.course_instance.id,
                assessment_instance: resLocals.assessment_instance,
                csrfToken: resLocals.__csrf_token,
                authz_result: resLocals.authz_result,
              }).toString(),
            }}
          />
        )}
        <div
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html: InstructorInfoPanel({
              course: resLocals.course,
              course_instance: resLocals.course_instance,
              assessment: resLocals.assessment,
              assessment_instance: resLocals.assessment_instance,
              instance_group: resLocals.instance_group,
              instance_group_uid_list: resLocals.instance_group_uid_list,
              instance_user: resLocals.instance_user,
              authz_data: resLocals.authz_data,
              questionContext:
                resLocals.assessment.type === 'Exam' ? 'student_exam' : 'student_homework',
              csrfToken: resLocals.__csrf_token,
            }).toString(),
          }}
        />
      </>
    ),
  });
}
