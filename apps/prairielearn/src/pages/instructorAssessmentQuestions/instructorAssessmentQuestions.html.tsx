import { PageLayout } from '../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
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
          assessment={resLocals.assessment}
          courseInstance={course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />
        <Hydrate>
          <InstructorAssessmentQuestionsTable
            course={course}
            questions={questions}
            urlPrefix={urlPrefix}
            assessmentType={resLocals.assessment.type}
            assessmentSetName={resLocals.assessment_set.name}
            assessmentNumber={resLocals.assessment.number}
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
