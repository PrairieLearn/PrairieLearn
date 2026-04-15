import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';

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
  StudentAssessmentSchema,
  StudentAssessmentSetSchema,
  type StudentGroupConfig,
  StudentGroupConfigSchema,
  StudentUserSchema,
} from '../../lib/client/safe-db-types.js';
import { getAssessmentInstanceTimeRemainingUrl } from '../../lib/client/url.js';
import { type GroupConfig } from '../../lib/db-types.js';
import type { GroupInfo } from '../../lib/groups.shared.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { StudentAssessmentInstanceBody } from './components/StudentAssessmentInstanceBody.js';
import {
  type InstanceQuestionRow,
  SafeStudentAssessmentInstanceSchema,
  StudentGroupInfoSchema,
  type StudentQuestionRow,
  StudentQuestionRowSchema,
} from './components/types.js';

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

  const assessmentInstanceOpen = !!resLocals.assessment_instance.open;
  const questionRows: StudentQuestionRow[] = instance_question_rows.map((row) =>
    StudentQuestionRowSchema.parse({ ...row, assessmentInstanceOpen }),
  );

  const assessment = StudentAssessmentSchema.parse(resLocals.assessment);
  const assessmentSet = StudentAssessmentSetSchema.parse(resLocals.assessment_set);
  const assessmentInstance = SafeStudentAssessmentInstanceSchema.parse({
    assessment_instance: resLocals.assessment_instance,
    some_questions_allow_real_time_grading: someQuestionsAllowRealTimeGrading,
  });
  const authzResult = StudentAssessmentInstanceAuthzResultSchema.parse(resLocals.authz_result);

  return PageLayout({
    resLocals,
    pageTitle: '', // Calculated automatically
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
            displayTimezone={resLocals.course_instance.display_timezone}
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
