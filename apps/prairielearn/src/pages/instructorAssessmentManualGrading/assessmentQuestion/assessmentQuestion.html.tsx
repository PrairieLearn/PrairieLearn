import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/preact/server';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.js';
import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import { compiledStylesheetTag } from '../../../lib/assets.js';
import type {
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../lib/client/safe-db-types.js';
import type { AssessmentQuestion } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { AssessmentQuestionManualGrading } from './AssessmentQuestionManualGrading.js';
import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';

export function AssessmentQuestion({
  resLocals,
  courseStaff,
  aiGradingEnabled,
  aiGradingMode,
  aiGradingStats,
  instanceQuestionGroups,
  rubric_data,
  instanceQuestions,
  search,
}: {
  resLocals: Record<string, any>;
  courseStaff: StaffUser[];
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  aiGradingStats: AiGradingGeneralStats | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  rubric_data: RubricData | null;
  instanceQuestions: InstanceQuestionRowWithAIGradingStats[];
  search: string;
}) {
  const {
    number_in_alternative_group,
    urlPrefix,
    assessment,
    question,
    __csrf_token,
    authz_data,
    assessment_question,
    num_open_instances,
    course_instance,
    course,
  } = resLocals;

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
    headContent: html` ${compiledStylesheetTag('tanstackTable.css')} `,
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
        <div class="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-0">
              <li class="breadcrumb-item">
                <a href={`${urlPrefix}/assessment/${assessment.id}/manual_grading`}>
                  {' '}
                  Manual grading{' '}
                </a>
              </li>
              <li class="breadcrumb-item active" aria-current="page">
                Question {number_in_alternative_group}. {question.title}
              </li>
            </ol>
          </nav>

          {aiGradingEnabled && (
            <form method="POST" id="toggle-ai-grading-mode-form" class="card px-3 py-2 mb-0">
              <input type="hidden" name="__action" value="toggle_ai_grading_mode" />
              <input type="hidden" name="__csrf_token" value={__csrf_token} />
              <div class="form-check form-switch mb-0">
                <input
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="switchCheckDefault"
                  checked={aiGradingMode}
                  // @ts-expect-error -- We don't want to hydrate this part of the DOM
                  onchange="setTimeout(() => this.form.submit(), 150)"
                />
                <label class="form-check-label" for="switchCheckDefault">
                  <i class="bi bi-stars" />
                  AI grading mode
                </label>
              </div>
            </form>
          )}
        </div>

        <Hydrate fullHeight>
          <AssessmentQuestionManualGrading
            authzData={authz_data}
            search={search}
            instanceQuestions={instanceQuestions}
            course={course}
            courseInstance={course_instance}
            urlPrefix={urlPrefix}
            csrfToken={__csrf_token}
            assessmentId={assessment.id}
            // TODO: FIXME:
            assessmentQuestion={assessment_question as unknown as StaffAssessmentQuestion}
            assessmentTid={assessment.tid}
            questionQid={question.qid}
            aiGradingMode={aiGradingMode}
            groupWork={assessment.group_work}
            rubricData={rubric_data}
            instanceQuestionGroups={instanceQuestionGroups}
            courseStaff={courseStaff}
            aiGradingStats={aiGradingStats}
            numOpenInstances={num_open_instances}
            isDevMode={process.env.NODE_ENV === 'development'}
          />
        </Hydrate>
      </>
    ),
  });
}
