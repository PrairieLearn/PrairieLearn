import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import type { StaffAssessmentQuestionRow } from '../../lib/assessment-question.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';

import { InstructorAssessmentQuestionsTable } from './components/InstructorAssessmentQuestionsTable.js';

export function InstructorAssessmentQuestions({
  resLocals,
  questionRows,
}: {
  resLocals: Record<string, any>;
  questionRows: StaffAssessmentQuestionRow[];
}) {
  const { authz_data, urlPrefix, course_instance, course, assessment, assessment_set } =
    extractPageContext(resLocals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

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
          authzData={authz_data}
          assessment={assessment}
          courseInstance={course_instance}
          course={course}
          urlPrefix={urlPrefix}
        />
        <Hydrate>
          <InstructorAssessmentQuestionsTable
            course={course}
            questionRows={questionRows}
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
