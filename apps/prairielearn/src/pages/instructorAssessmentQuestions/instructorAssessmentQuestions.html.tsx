import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import type { AssessmentQuestionRow } from '../../models/assessment-question.js';
import { AssessmentQuestionsTable } from './components/AssessmentQuestionsTable.js';

export function InstructorAssessmentQuestions({
  resLocals,
  questions,
}: {
  resLocals: Record<string, any>;
  questions: AssessmentQuestionRow[];
}) {
  return (
    <>
      <div
        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{
          __html: AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          }).toString(),
        }}
      />
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>
            ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Questions
          </h1>
        </div>
        <AssessmentQuestionsTable
          course={resLocals.course}
          questions={questions}
          urlPrefix={resLocals.urlPrefix}
          assessmentType={resLocals.assessment_type}
          hasCoursePermissionPreview={resLocals.authz_data.has_course_permission_preview}
          hasCourseInstancePermissionEdit={resLocals.authz_data.has_course_instance_permission_edit}
        />
      </div>
    </>
  );
}
