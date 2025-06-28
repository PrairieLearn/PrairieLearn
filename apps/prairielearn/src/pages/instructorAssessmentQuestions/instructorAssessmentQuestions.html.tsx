import { PageLayout } from '../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { Hydrate } from '../../lib/preact.js';
import type { AssessmentQuestionRow } from '../../models/assessment-question.types.js';

import { InstructorAssessmentQuestionsTable } from './components/InstructorAssessmentQuestionsTable.js';

export function InstructorAssessmentQuestions({
  resLocals,
  questions,
}: {
  resLocals: Record<string, any>;
  questions: AssessmentQuestionRow[];
}) {
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
          authz_data={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />
        <Hydrate>
          <InstructorAssessmentQuestionsTable
            course={resLocals.course}
            questions={questions}
            urlPrefix={resLocals.urlPrefix}
            assessmentType={resLocals.assessment.type}
            assessmentSetName={resLocals.assessment_set_name}
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
