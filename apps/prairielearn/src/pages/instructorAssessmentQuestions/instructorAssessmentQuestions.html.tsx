import { PageLayout } from '../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  getAssessmentContext,
  getCourseInstanceContext,
  getPageContext,
} from '../../lib/client/page-context.js';
import type { StaffCourse, StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import { Hydrate } from '../../lib/preact.js';
import type { AssessmentQuestionRow } from '../../models/assessment-question.js';

import { InstructorAssessmentQuestionsTable } from './components/InstructorAssessmentQuestionsTable.js';

export function InstructorAssessmentQuestions({
  resLocals,
  questions,
}: {
  resLocals: Record<string, any>;
  questions: AssessmentQuestionRow[];
}) {
  const { authz_data, urlPrefix } = getPageContext(resLocals);
  const { course_instance, course } = getCourseInstanceContext(resLocals, 'instructor');
  const { assessment, assessment_set } = getAssessmentContext(resLocals);

  return PageLayout({
    resLocals,
    pageTitle: 'Questions',
    headContent: compiledScriptTag('instructorAssessmentQuestionsClient.ts'),
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'questions',
    },
    options: {
      fullWidth: true,
    },
    content: (
      <>
        <AssessmentSyncErrorsAndWarnings
          authz_data={authz_data}
          assessment={assessment}
          courseInstance={course_instance as StaffCourseInstance}
          course={course as StaffCourse}
          urlPrefix={urlPrefix}
        />
        <Hydrate>
          <InstructorAssessmentQuestionsTable
            course={course as StaffCourse}
            questions={questions}
            urlPrefix={urlPrefix}
            assessmentType={assessment.type}
            assessmentSetName={assessment_set.name}
            assessmentNumber={assessment.number}
            hasCoursePermissionPreview={resLocals.authz_data.has_course_permission_preview}
            hasCourseInstancePermissionEdit={
              resLocals.authz_data.has_course_instance_permission_edit
            }
            csrfToken={resLocals.__csrf_token}
          />
        </Hydrate>
      </>
    ),
  });
}

InstructorAssessmentQuestions.displayName = 'InstructorAssessmentQuestions';
