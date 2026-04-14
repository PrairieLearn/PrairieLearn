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
  RawStudentAssessmentInstanceSchema__UNSAFE,
  StudentAccessRuleSchema,
  StudentAssessmentInstanceAuthzResultSchema,
  StudentAssessmentQuestionSchema,
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  StudentGroupConfigSchema,
  StudentGroupRoleSchema,
  StudentInstanceQuestionSchema__UNSAFE,
  StudentQuestionSchema,
  StudentZoneSchema,
} from '../../lib/client/safe-db-types.js';
import { getAssessmentInstanceTimeRemainingUrl } from '../../lib/client/url.js';
import { EnumQuestionAccessModeSchema, type GroupConfig } from '../../lib/db-types.js';
import { type GroupInfo, getRoleNamesForUser } from '../../lib/groups.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { SimpleVariantWithScoreSchema } from '../../models/variant.js';

import { StudentAssessmentInstanceBody } from './components/StudentAssessmentInstanceBody.js';
import type { StudentGroupInfo, StudentQuestionRow } from './components/types.js';

const StudentAssessmentInstanceDataSchema = z
  .object({
    assessment_instance: RawStudentAssessmentInstanceSchema__UNSAFE,
    some_questions_allow_real_time_grading: z.boolean(),
  })
  .transform((data) => {
    // When real-time grading is fully disabled and the instance is open,
    // don't leak score data to the client — the UI only shows max_points.
    if (!data.some_questions_allow_real_time_grading && data.assessment_instance.open) {
      data.assessment_instance.points = null;
      data.assessment_instance.score_perc = null;
    }
    return data.assessment_instance;
  })
  .brand('StudentAssessmentInstance');

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
  const someQuestionsAllowRealTimeGrading = instance_question_rows.some(
    (q) => q.assessment_question.allow_real_time_grading,
  );

  const userGroupRoles = groupInfo
    ? getRoleNamesForUser(groupInfo, resLocals.authz_data.user).join(', ')
    : null;

  const accessRules = resLocals.authz_result.access_rules.map((rule) =>
    StudentAccessRuleSchema.parse(rule),
  );

  const accessTimeline = resLocals.authz_result.access_timeline ?? [];

  const studentGroupConfig = groupConfig ? StudentGroupConfigSchema.parse(groupConfig) : null;

  const studentGroupInfo: StudentGroupInfo | null = groupInfo
    ? {
        group_name: groupInfo.groupName,
        join_code: groupInfo.joinCode,
        group_members: groupInfo.groupMembers.map((u) => ({ uid: u.uid, id: u.id })),
        group_size: groupInfo.groupSize,
        roles_info: groupInfo.rolesInfo
          ? {
              role_assignments: Object.fromEntries(
                Object.entries(groupInfo.rolesInfo.roleAssignments).map(([uid, assignments]) => [
                  uid,
                  assignments.map((a) => ({
                    role_name: a.role_name,
                    team_role_id: a.team_role_id,
                  })),
                ]),
              ),
              group_roles: groupInfo.rolesInfo.groupRoles.map((r) => ({
                ...StudentGroupRoleSchema.parse(r),
                count: r.count,
              })),
              validation_errors: groupInfo.rolesInfo.validationErrors.map((r) => ({
                ...StudentGroupRoleSchema.parse(r),
                count: r.count,
              })),
              disabled_roles: groupInfo.rolesInfo.disabledRoles,
              roles_are_balanced: groupInfo.rolesInfo.rolesAreBalanced,
              users_without_roles: groupInfo.rolesInfo.usersWithoutRoles.map((u) => ({
                uid: u.uid,
                id: u.id,
              })),
            }
          : undefined,
      }
    : null;

  const isGroupAssessment = groupConfig != null;
  const assessmentInstanceOpen = !!resLocals.assessment_instance.open;
  const redactScores = !someQuestionsAllowRealTimeGrading && assessmentInstanceOpen;
  const questionRows: StudentQuestionRow[] = instance_question_rows.map((row) => {
    const zone = StudentZoneSchema.parse(row.zone);
    const instanceQuestion = StudentInstanceQuestionSchema__UNSAFE.parse(row.instance_question);
    const assessmentQuestion = StudentAssessmentQuestionSchema.parse(row.assessment_question);
    const question = StudentQuestionSchema.parse(row.question);

    if (redactScores) {
      instanceQuestion.auto_points = null;
      instanceQuestion.manual_points = null;
      instanceQuestion.points = null;
      instanceQuestion.highest_submission_score = null;
      instanceQuestion.current_value = null;
    }

    return {
      zone,
      instance_question: instanceQuestion,
      assessment_question: assessmentQuestion,
      question,
      start_new_zone: row.start_new_zone,
      lockpoint_crossed: row.lockpoint_crossed,
      lockpoint_crossed_info: run(() => {
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
      question_number: row.question_number,
      question_access_mode: row.question_access_mode,
      prev_advance_score_perc: row.prev_advance_score_perc,
      prev_title: row.prev_title,
      prev_question_access_mode: row.prev_question_access_mode,
      group_role_permissions: row.group_role_permissions
        ? {
            can_view: row.group_role_permissions.can_view,
            can_submit: row.group_role_permissions.can_submit,
          }
        : undefined,
      file_count: row.file_count,
      zone_question_count: row.zone_question_count,
      allow_grade_left_ms: row.allowGradeLeftMs,
      instance_question_open: assessmentInstanceOpen && row.instance_question.open,
      previous_variants: redactScores
        ? null
        : (row.previous_variants?.map((v) => ({
            id: v.id,
            open: v.open,
            max_submission_score: v.max_submission_score,
          })) ?? null),
    };
  });

  const assessment = StudentAssessmentSchema.parse(resLocals.assessment);
  const assessmentSet = StudentAssessmentSetSchema.parse(resLocals.assessment_set);
  const assessmentInstance = StudentAssessmentInstanceDataSchema.parse({
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
            accessTimeline={accessTimeline}
            displayTimezone={resLocals.course_instance.display_timezone}
            groupConfig={studentGroupConfig}
            groupInfo={studentGroupInfo}
            userCanAssignRoles={userCanAssignRoles ?? false}
            questionRows={questionRows}
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
