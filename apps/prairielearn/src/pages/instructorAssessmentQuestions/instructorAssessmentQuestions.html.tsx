import { PageLayout } from '../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import type { AssessmentQuestionRow } from '../../models/assessment-question.types.js';

import { AssessmentQuestionsTable } from './components/AssessmentQuestionsTable.js';

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
        <div class="card mb-4">
          <div class="card-header bg-primary text-white d-flex align-items-center">
            <h1>
              {resLocals.assessment_set.name} {resLocals.assessment.number}: Questions
            </h1>
          </div>
          <AssessmentQuestionsTable
            course={resLocals.course}
            questions={questions}
            urlPrefix={resLocals.urlPrefix}
            assessmentType={resLocals.assessment.type}
            hasCoursePermissionPreview={resLocals.authz_data.has_course_permission_preview}
            hasCourseInstancePermissionEdit={
              resLocals.authz_data.has_course_instance_permission_edit
            }
            csrfToken={resLocals.__csrf_token}
          />
        </div>
      </>
    ),
  });
}

InstructorAssessmentQuestions.displayName = 'InstructorAssessmentQuestions';
