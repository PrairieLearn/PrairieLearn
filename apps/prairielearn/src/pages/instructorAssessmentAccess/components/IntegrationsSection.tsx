import { Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

export function IntegrationsSection() {
  const { setValue } = useFormContext<AccessControlFormData>();

  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });

  const prairieTestEnabled = prairieTestExams.length > 0;

  return (
    <div>
      <div className="section-header mb-3">
        <strong>Integrations</strong>
      </div>
      <Form.Check
        type="checkbox"
        id="defaultRule-prairietest-enabled"
        label={<strong>PrairieTest</strong>}
        checked={prairieTestEnabled}
        aria-describedby="defaultRule-prairietest-help"
        onChange={(e) => {
          if (!e.target.checked) {
            setValue('defaultRule.prairieTestExams', [], {
              shouldDirty: true,
              shouldValidate: true,
            });
          } else {
            // Add an initial entry when toggling it on so that the user can immediately
            // start configuring it without needing to click "Add Exam" first.
            setValue(
              'defaultRule.prairieTestExams',
              [
                {
                  examUuid: '',
                  readOnly: false,
                  afterCompleteQuestionsHidden: false,
                  afterCompleteScoreHidden: false,
                },
              ],
              {
                shouldDirty: true,
                shouldValidate: true,
              },
            );
          }
        }}
      />
      <Form.Text id="defaultRule-prairietest-help" className="text-muted">
        Control access to your assessment through PrairieTest exams.
      </Form.Text>
      {prairieTestEnabled && <PrairieTestControlForm />}
    </div>
  );
}
