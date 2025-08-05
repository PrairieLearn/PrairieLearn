import { onDocumentReady } from '@prairielearn/browser-utils';
import { render } from '@prairielearn/preact-cjs';

import { AssessmentQuestionRubricTable } from '../../src/pages/instructorAssessmentManualGrading/assessmentQuestion/assessmentQuestionRubricTablePreact.html.js';

onDocumentReady(() => {
  const rubricTable = document.querySelector('#rubric-table-preact') as HTMLElement;
  const assessment_question = JSON.parse(rubricTable.dataset.assessmentQuestion ?? '');
  const rubric_data = JSON.parse(rubricTable.dataset.rubricData ?? '');
  const aiGradingStats = JSON.parse(rubricTable.dataset.aiGradingStats ?? '');
  render(
    <AssessmentQuestionRubricTable
      assessment_question={assessment_question}
      rubric_data={rubric_data}
      __csrf_token=""
      aiGradingEnabled={true}
      aiGradingMode={true}
      aiGradingStats={aiGradingStats}
    />,
    rubricTable,
  );
});
