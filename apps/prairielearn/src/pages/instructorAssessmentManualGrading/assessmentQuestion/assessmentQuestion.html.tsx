import { Hydrate } from '@prairielearn/preact/server';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import { compiledStylesheetTag } from '../../../lib/assets.js';
import {
  getAssessmentContext,
  getCourseInstanceContext,
  getPageContext,
} from '../../../lib/client/page-context.js';
import {
  StaffAssessmentQuestionSchema,
  type StaffInstanceQuestionGroup,
  StaffQuestionSchema,
  type StaffUser,
} from '../../../lib/client/safe-db-types.js';
import type { AssessmentQuestion } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AssessmentQuestionManualGrading } from './components/AssessmentQuestionManualGrading.js';

export function AssessmentQuestion({
  resLocals,
  courseStaff,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingStats,
  instanceQuestionGroups,
  rubric_data,
  instanceQuestionsInfo,
  search,
}: {
  resLocals: ResLocalsForPage['instructor-assessment-question'];
  courseStaff: StaffUser[];
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  aiGradingStats: AiGradingGeneralStats | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  rubric_data: RubricData | null;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  search: string;
}) {
  const { authz_data, urlPrefix, __csrf_token } = getPageContext(resLocals);
  const hasCourseInstancePermissionEdit = authz_data.has_course_instance_permission_edit ?? false;

  const { course_instance, course } = getCourseInstanceContext(resLocals, 'instructor');

  const { assessment } = getAssessmentContext(resLocals);

  // TODO: see https://github.com/PrairieLearn/PrairieLearn/pull/13348
  const question = StaffQuestionSchema.parse(resLocals.question);
  const assessment_question = StaffAssessmentQuestionSchema.parse(resLocals.assessment_question);
  const { num_open_instances, number_in_alternative_group } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Manual Grading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    options: {
      fullWidth: true,
      pageNote: `Question ${number_in_alternative_group}`,
    },
    headContent: compiledStylesheetTag('tanstackTable.css'),
    content: (
      <>
        <AssessmentSyncErrorsAndWarnings
          authzData={authz_data}
          assessment={assessment}
          courseInstance={course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />
        <AssessmentOpenInstancesAlert
          numOpenInstances={num_open_instances}
          assessmentId={assessment.id}
          urlPrefix={urlPrefix}
        />

        <Hydrate fullHeight>
          <AssessmentQuestionManualGrading
            hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
            search={search}
            instanceQuestionsInfo={instanceQuestionsInfo}
            course={course}
            courseInstance={course_instance}
            urlPrefix={urlPrefix}
            csrfToken={__csrf_token}
            assessment={assessment}
            assessmentQuestion={assessment_question}
            questionQid={question.qid!}
            aiGradingEnabled={aiGradingEnabled}
            initialAiGradingMode={aiGradingMode}
            rubricData={rubric_data}
            instanceQuestionGroups={instanceQuestionGroups}
            courseStaff={courseStaff}
            aiGradingStats={aiGradingStats}
            numOpenInstances={num_open_instances}
            isDevMode={process.env.NODE_ENV === 'development'}
            questionTitle={question.title ?? ''}
            questionNumber={Number(number_in_alternative_group)}
          />
        </Hydrate>
      </>
    ),
  });
}
