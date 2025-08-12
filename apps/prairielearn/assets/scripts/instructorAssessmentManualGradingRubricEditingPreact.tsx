import { onDocumentReady } from '@prairielearn/browser-utils';
import { render } from '@prairielearn/preact-cjs';

import { RubricSettings } from '../../src/pages/instructorAssessmentManualGrading/assessmentQuestion/RubricSettings.js';

onDocumentReady(() => {
  const rubricSettings = document.querySelector('#rubric-settings') as HTMLElement;
  if (!rubricSettings.dataset.csrfToken || !rubricSettings.dataset.assessmentQuestion) {
    throw new Error('CSRF token or assessment question is not loaded correctly.');
  }
  const __csrf_token = rubricSettings.dataset.csrfToken;
  const assessment_question = JSON.parse(rubricSettings.dataset.assessmentQuestion);
  const rubric_data = JSON.parse(rubricSettings.dataset.rubricData ?? 'null');
  const aiGradingStats = JSON.parse(rubricSettings.dataset.aiGradingStats ?? 'null');
  render(
    <RubricSettings
      assessment_question={assessment_question}
      rubric_data={rubric_data}
      __csrf_token={__csrf_token}
      aiGradingStats={aiGradingStats}
    />,
    rubricSettings,
  );
});
