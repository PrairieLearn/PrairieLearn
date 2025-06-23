import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import {
  AssessmentQuestionHeaders,
  AssessmentQuestionNumber,
} from '../../components/AssessmentQuestions.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';
import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import type { Course } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import type { AssessmentQuestionRow } from '../../models/assessment-question.js';
import { AssessmentQuestionsTable } from './components/AssessmentQuestionsTable.js';
import { hydrate } from '../../lib/preact.js';

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
