import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';
import { DateFromISOString } from '@prairielearn/zod';

import {
  RegenerateInstanceAlert,
  RegenerateInstanceModal,
} from '../../components/AssessmentRegenerate.js';
import { GroupWorkInfoContainer } from '../../components/GroupWorkInfoContainer.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../components/PersonalNotesPanel.js';
import {
  ExamQuestionAvailablePoints,
  ExamQuestionStatus,
  InstanceQuestionPoints,
  QuestionVariantHistory,
} from '../../components/QuestionScore.js';
import { StudentAccessRulesPopover } from '../../components/StudentAccessRulesPopover.js';
import { TimeLimitExpiredModal } from '../../components/TimeLimitExpiredModal.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  StudentAssessmentInstanceAuthzResultSchema,
  StudentAssessmentQuestionSchema,
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  StudentInstanceQuestionSchema,
  StudentQuestionSchema,
  StudentZoneSchema,
} from '../../lib/client/safe-db-types.js';
import { EnumQuestionAccessModeSchema, type GroupConfig } from '../../lib/db-types.js';
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

export const InstanceQuestionRowSchema = z.object({
  instance_question: StudentInstanceQuestionSchema,
  zone: StudentZoneSchema,
  assessment_question: StudentAssessmentQuestionSchema,
  question: StudentQuestionSchema,
  start_new_zone: z.boolean(),
  lockpoint_crossed: z.boolean(),
  lockpoint_crossed_at: DateFromISOString.nullable(),
  lockpoint_crossed_authn_user_uid: z.string().nullable(),
  row_order: z.number(),
  question_number: z.string(),
  question_access_mode: EnumQuestionAccessModeSchema,
  zone_question_count: z.number(),
  file_count: z.number(),
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
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

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
    (q) => q.assessment_question.allow_real_time_grading,
  );
  const someQuestionsForbidRealTimeGrading = instance_question_rows.some(
    (q) => !q.assessment_question.allow_real_time_grading,
  );

  instance_question_rows.forEach((row) => {
    if (row.instance_question.status === 'saved') {
      if (row.allowGradeLeftMs > 0) {
        suspendedSavedAnswers++;
      } else if (
        (row.assessment_question.max_auto_points || !row.assessment_question.max_manual_points) &&
        row.assessment_question.allow_real_time_grading
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
    .filter((row) => row.start_new_zone && row.zone.lockpoint && !row.lockpoint_crossed)
    .map((row) => row.zone.number)
    .sort((a, b) => a - b)[0];

  const hasUnmetAdvanceScorePercBeforeLockpoint = (zoneNumber: number) =>
    instance_question_rows.some(
      (row) =>
        row.question_access_mode === 'blocked_sequence' &&
        (row.zone.number < zoneNumber || (row.zone.number === zoneNumber && row.start_new_zone)),
    );

  const isLockpointCrossable = (row: InstanceQuestionRow) =>
    resLocals.assessment_instance.open &&
    resLocals.authz_result.active &&
    resLocals.authz_result.authorized_edit &&
    row.zone.lockpoint &&
    !row.lockpoint_crossed &&
    row.zone.number === firstUncrossedLockpointZoneNumber &&
    !hasUnmetAdvanceScorePercBeforeLockpoint(row.zone.number);

  const crossableLockpointRows = instance_question_rows.filter(
    (row) =>
      row.start_new_zone &&
      row.zone.lockpoint &&
      !row.lockpoint_crossed &&
      isLockpointCrossable(row),
  );

  // Pre-render shared HTML-template components for the question table cells.
  const rowRenderedHtml: RowRenderedHtml[] = instance_question_rows.map((row) => {
    const rendered: RowRenderedHtml = {};
    const { instance_question: iq, assessment_question: aq } = row;

    if (resLocals.assessment.type === 'Exam') {
      if (row.question_access_mode === 'blocked_lockpoint') {
        rendered.statusHtml = '<span class="badge text-bg-secondary">Locked</span>';
      } else {
        rendered.statusHtml = ExamQuestionStatus({
          instance_question: iq,
          assessment_question: aq,
          realTimeGradingPartiallyDisabled:
            someQuestionsAllowRealTimeGrading && someQuestionsForbidRealTimeGrading,
          allowGradeLeftMs: row.allowGradeLeftMs,
        }).toString();
      }

      if (resLocals.has_auto_grading_question && someQuestionsAllowRealTimeGrading) {
        rendered.availablePointsHtml = aq.max_auto_points
          ? ExamQuestionAvailablePoints({
              open: (resLocals.assessment_instance.open && iq.open) ?? false,
              currentWeight:
                (iq.points_list_original?.[iq.number_attempts] ?? 0) - (aq.max_manual_points ?? 0),
              pointsList: iq.points_list?.map((p) => p - (aq.max_manual_points ?? 0)),
              highestSubmissionScore: iq.highest_submission_score,
            }).toString()
          : '&mdash;';
      }

      if (someQuestionsAllowRealTimeGrading || !resLocals.assessment_instance.open) {
        if (resLocals.has_auto_grading_question && resLocals.has_manual_grading_question) {
          rendered.autoPointsHtml = InstanceQuestionPoints({
            instance_question: iq,
            assessment_question: aq,
            component: 'auto',
          }).toString();
          rendered.manualPointsHtml = InstanceQuestionPoints({
            instance_question: iq,
            assessment_question: aq,
            component: 'manual',
          }).toString();
        }
        rendered.totalPointsHtml = InstanceQuestionPoints({
          instance_question: iq,
          assessment_question: aq,
          component: 'total',
        }).toString();
      } else {
        if (resLocals.has_auto_grading_question && resLocals.has_manual_grading_question) {
          rendered.autoPointsHtml = formatPoints(aq.max_auto_points);
          rendered.manualPointsHtml = formatPoints(aq.max_manual_points);
        }
        rendered.totalPointsHtml = formatPoints(aq.max_points);
      }
    } else {
      // Homework
      if (resLocals.has_auto_grading_question) {
        if (!aq.max_auto_points) {
          rendered.availablePointsHtml = '&mdash;';
        } else {
          const currentAutoValue = (iq.current_value ?? 0) - (aq.max_manual_points ?? 0);
          rendered.availablePointsHtml = formatPoints(currentAutoValue);
        }
        rendered.variantHistoryHtml = QuestionVariantHistory({
          urlPrefix: resLocals.urlPrefix,
          instanceQuestionId: iq.id,
          previousVariants: row.previous_variants,
        }).toString();
      }

      if (resLocals.has_auto_grading_question && resLocals.has_manual_grading_question) {
        rendered.autoPointsHtml = InstanceQuestionPoints({
          instance_question: iq,
          assessment_question: aq,
          component: 'auto',
        }).toString();
        rendered.manualPointsHtml = InstanceQuestionPoints({
          instance_question: iq,
          assessment_question: aq,
          component: 'manual',
        }).toString();
      }
      rendered.totalPointsHtml = InstanceQuestionPoints({
        instance_question: iq,
        assessment_question: aq,
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
    id: row.instance_question.id,
    startNewZone: row.start_new_zone,
    zoneId: row.zone.id,
    zoneNumber: row.zone.number,
    zoneTitle: row.zone.title,
    lockpoint: row.zone.lockpoint,
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
    questionTitle: row.question.title,
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
    zoneMaxPoints: row.zone.max_points,
    zoneHasMaxPoints: row.zone.max_points != null,
    zoneBestQuestions: row.zone.best_questions,
    zoneHasBestQuestions: row.zone.best_questions != null,
    zoneQuestionCount: row.zone_question_count,
  }));

  const assessment = StudentAssessmentSchema.parse(resLocals.assessment);
  const assessmentSet = StudentAssessmentSetSchema.parse(resLocals.assessment_set);
  const assessmentInstance = StudentAssessmentInstanceSchema.parse(resLocals.assessment_instance);
  const authzResult = StudentAssessmentInstanceAuthzResultSchema.parse(resLocals.authz_result);

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
              canTriggerFinish: authzResult.authorizedEdit,
              showsTimeoutWarning: true,
              reloadOnFail: true,
              csrfToken: resLocals.__csrf_token,
            },
            'time-limit-data',
          )}`
        : ''}
    `,
    preContent: html`
      ${userCanDeleteAssessmentInstance
        ? RegenerateInstanceModal({ csrfToken: resLocals.__csrf_token })
        : ''}
      ${resLocals.assessment.type === 'Exam'
        ? ConfirmFinishModalHtml({
            instance_question_rows,
            csrfToken: resLocals.__csrf_token,
          })
        : ''}
      ${crossableLockpointRows.map((row) =>
        Modal({
          id: `crossLockpointModal-${row.zone.id}`,
          title: 'Proceed to next questions?',
          body: html`
            <p>
              After proceeding, you will not be able to submit answers to previous questions. You
              can still review your previous submissions.
            </p>
            ${groupConfig != null
              ? html`
                  <p class="fw-bold">
                    This will affect all group members. No one in your group will be able to submit
                    answers to previous questions.
                  </p>
                `
              : ''}
            <div class="form-check">
              <input
                class="form-check-input"
                type="checkbox"
                id="lockpoint-confirm-${row.zone.id}"
                onchange="document.getElementById('lockpoint-submit-${row.zone
                  .id}').disabled = !this.checked"
              />
              <label class="form-check-label" for="lockpoint-confirm-${row.zone.id}">
                I understand that I will not be able to submit answers to previous questions
              </label>
            </div>
          `,
          footer: html`
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="zone_id" value="${row.zone.id}" />
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button
              type="submit"
              name="__action"
              value="cross_lockpoint"
              class="btn btn-warning"
              id="lockpoint-submit-${row.zone.id}"
              disabled
            >
              Confirm
            </button>
          `,
        }),
      )}
      ${showTimeLimitExpiredModal ? TimeLimitExpiredModal({ showAutomatically: true }) : ''}
    `,
    content: (
      <>
        {userCanDeleteAssessmentInstance && (
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          <div dangerouslySetInnerHTML={{ __html: RegenerateInstanceAlert().toString() }} />
        )}
        <Hydrate>
          <StudentAssessmentInstanceBody
            assessment={assessment}
            assessmentSet={assessmentSet}
            assessmentInstance={assessmentInstance}
            remainingMs={resLocals.assessment_instance_remaining_ms ?? null}
            authzResult={authzResult}
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
            urlPrefix={resLocals.urlPrefix}
            csrfToken={resLocals.__csrf_token}
            userGroupRoles={userGroupRoles}
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

function ConfirmFinishModalHtml({
  instance_question_rows,
  csrfToken,
}: {
  instance_question_rows: InstanceQuestionRow[];
  csrfToken: string;
}) {
  const allQuestionsAnswered = instance_question_rows.every(
    (row) => row.instance_question.status !== 'unanswered',
  );
  return Modal({
    id: 'confirmFinishModal',
    title: 'All done?',
    body: html`
      ${!allQuestionsAnswered
        ? html`<div class="alert alert-warning">There are still unanswered questions.</div>`
        : ''}
      <p class="text-danger">
        <strong>Warning</strong>: You will not be able to answer any more questions after finishing
        the assessment.
      </p>
      <p>Are you sure you want to finish, complete, and close out the assessment?</p>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" data-bs-dismiss="modal" class="btn btn-secondary">Cancel</button>
      <button type="submit" class="btn btn-danger" name="__action" value="finish">
        Finish assessment
      </button>
    `,
  });
}
