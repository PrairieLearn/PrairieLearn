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
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../components/PageLayout.js';
import { PersonalNotesPanel } from '../../components/PersonalNotesPanel.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  type StudentAccessRule,
  StudentAccessRuleSchema,
  StudentAssessmentInstanceAuthzResultSchema,
  StudentAssessmentQuestionSchema,
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  type StudentGroupConfig,
  StudentGroupConfigSchema,
  StudentInstanceQuestionSchema__UNSAFE,
  StudentQuestionSchema,
  StudentUserSchema,
  StudentZoneSchema,
} from '../../lib/client/safe-db-types.js';
import { getAssessmentInstanceTimeRemainingUrl } from '../../lib/client/url.js';
import { EnumQuestionAccessModeSchema, type GroupConfig } from '../../lib/db-types.js';
import type { GroupInfo } from '../../lib/groups.shared.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { SimpleVariantWithScoreSchema } from '../../models/variant.js';

import { StudentAssessmentInstanceBody } from './components/StudentAssessmentInstanceBody.js';
import {
  SafeStudentAssessmentInstanceSchema,
  StudentGroupInfoSchema,
  type StudentQuestionRow,
} from './components/types.js';

export const InstanceQuestionRowSchema = z.object({
  instance_question: StudentInstanceQuestionSchema__UNSAFE,
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
type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export function StudentAssessmentInstance({
  instance_question_rows,
  showTimeLimitExpiredModal,
  groupConfig,
  groupInfo,
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
    }
  | {
      groupConfig?: undefined;
      groupInfo?: undefined;
    }
)) {
  const someQuestionsAllowRealTimeGrading = instance_question_rows.some(
    (q) => q.assessment_question.allow_real_time_grading,
  );

  // Map access rules to client-safe type.
  const accessRules: StudentAccessRule[] = resLocals.authz_result.access_rules.map((rule) =>
    StudentAccessRuleSchema.parse(rule),
  );

  // Map group config/info to client-safe types.
  const clientGroupConfig: StudentGroupConfig | null = groupConfig
    ? StudentGroupConfigSchema.parse(groupConfig)
    : null;

  const clientGroupInfo = groupInfo ? StudentGroupInfoSchema.parse(groupInfo) : null;

  // Map rows to client-safe type with scoring data (no db-types.ts references).
  const isGroupAssessment = groupConfig != null;
  const assessmentInstanceOpen = !!resLocals.assessment_instance.open;
  const questionRows: StudentQuestionRow[] = instance_question_rows.map((row) => {
    // When real-time grading is disabled for this question and the instance is
    // open, redact scored values so they aren't leaked in the hydration payload.
    const redactScores = assessmentInstanceOpen && !row.assessment_question.allow_real_time_grading;

    return {
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

      // Instance question scoring data.
      autoPoints: redactScores ? null : row.instance_question.auto_points,
      manualPoints: redactScores ? null : row.instance_question.manual_points,
      points: redactScores ? null : row.instance_question.points,
      status: row.instance_question.status,
      requiresManualGrading: row.instance_question.requires_manual_grading,
      hasLastGrader: row.instance_question.has_last_grader,
      maxAutoPoints: row.assessment_question.max_auto_points,
      maxManualPoints: row.assessment_question.max_manual_points,
      maxPoints: row.assessment_question.max_points,
      allowRealTimeGrading: row.assessment_question.allow_real_time_grading,
      allowGradeLeftMs: row.allowGradeLeftMs,
      instanceQuestionOpen: assessmentInstanceOpen && row.instance_question.open,
      pointsListOriginal: redactScores ? null : row.instance_question.points_list_original,
      numberAttempts: row.instance_question.number_attempts,
      pointsList: redactScores ? null : row.instance_question.points_list,
      highestSubmissionScore: redactScores ? null : row.instance_question.highest_submission_score,
      currentValue: redactScores ? null : row.instance_question.current_value,
      previousVariants: redactScores
        ? null
        : (row.previous_variants?.map((v) => ({
            id: v.id,
            open: v.open,
            maxSubmissionScore: v.max_submission_score,
          })) ?? null),
    };
  });

  const assessment = StudentAssessmentSchema.parse(resLocals.assessment);
  const assessmentSet = StudentAssessmentSetSchema.parse(resLocals.assessment_set);
  const assessmentInstance = SafeStudentAssessmentInstanceSchema.parse({
    assessment_instance: resLocals.assessment_instance,
    some_questions_allow_real_time_grading: someQuestionsAllowRealTimeGrading,
  });
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
              serverUpdateURL: getAssessmentInstanceTimeRemainingUrl({
                courseInstanceId: resLocals.course_instance.id,
                assessmentInstanceId: resLocals.assessment_instance.id,
              }),
              canTriggerFinish: authzResult.authorized_edit,
              showsTimeoutWarning: true,
              reloadOnFail: true,
              csrfToken: resLocals.__csrf_token,
            },
            'time-limit-data',
          )}`
        : ''}
    `,
    // TODO: Convert RegenerateInstanceModal to a React component so it can
    // be rendered directly instead of via preContent raw HTML.
    preContent: userCanDeleteAssessmentInstance
      ? RegenerateInstanceModal({ csrfToken: resLocals.__csrf_token })
      : '',
    content: (
      <>
        {userCanDeleteAssessmentInstance && (
          // TODO: Convert RegenerateInstanceAlert to a React component so it
          // can be rendered directly instead of via dangerouslySetInnerHTML.
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
            assessmentTextHtml={resLocals.assessment_text_templated}
            accessRules={accessRules}
            groupConfig={clientGroupConfig}
            groupInfo={clientGroupInfo}
            hasCourseInstancePermissionEdit={
              resLocals.authz_data.has_course_instance_permission_edit
            }
            questionRows={questionRows}
            csrfToken={resLocals.__csrf_token}
            user={StudentUserSchema.parse(resLocals.authz_data.user)}
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
