// import assert from 'node:assert';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { render } from '@prairielearn/preact-cjs';

import { AssessmentQuestionRubricTable } from '../../src/pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestionRubricTablePreact.html.js';

onDocumentReady(() => {
  const rubricTable = document.querySelector('#rubric-editing-preact') as HTMLElement;
  // assert(rubricTable.dataset.csrfToken);
  // assert(rubricTable.dataset.assessmentQuestion);
  if (!rubricTable.dataset.csrfToken || !rubricTable.dataset.assessmentQuestion) {
    return;
  }
  const __csrf_token = rubricTable.dataset.csrfToken;
  const assessment_question = JSON.parse(rubricTable.dataset.assessmentQuestion);
  const rubric_data = JSON.parse(rubricTable.dataset.rubricData ?? 'null');
  const aiGradingStats = JSON.parse(rubricTable.dataset.aiGradingStats ?? 'null');
  render(
    <AssessmentQuestionRubricTable
      assessment_question={assessment_question}
      rubric_data={rubric_data}
      __csrf_token={__csrf_token}
      aiGradingStats={aiGradingStats}
    />,
    rubricTable,
  );
});
