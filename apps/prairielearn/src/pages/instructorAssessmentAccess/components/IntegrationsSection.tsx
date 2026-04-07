import { Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

export function IntegrationsSection() {
  const { register, setValue } = useFormContext<AccessControlFormData>();

  const prairieTestEnabled = useWatch<AccessControlFormData, 'mainRule.prairieTestEnabled'>({
    name: 'mainRule.prairieTestEnabled',
  });

  const prairieTestRegistration = register('mainRule.prairieTestEnabled');

  return (
    <div>
      <div className="section-header mb-3">
        <strong>Integrations</strong>
      </div>
      <Form.Check
        type="checkbox"
        id="mainRule-prairietest-enabled"
        label={<strong>PrairieTest</strong>}
        defaultChecked={prairieTestEnabled}
        {...prairieTestRegistration}
        aria-describedby="mainRule-prairietest-help"
        onChange={(e) => {
          void prairieTestRegistration.onChange(e);
          if (!e.target.checked) {
            setValue('mainRule.prairieTestExams', [], { shouldDirty: true });
          } else {
            // Add an initial entry when toggling it on so that the user can immediately
            // start configuring it without needing to click "Add Exam" first.
            setValue('mainRule.prairieTestExams', [{ examUuid: '', readOnly: false }], {
              shouldDirty: true,
            });
          }
        }}
      />
      <Form.Text id="mainRule-prairietest-help" className="text-muted">
        Control access to your assessment through PrairieTest exams
      </Form.Text>
      {prairieTestEnabled && <PrairieTestControlForm />}
    </div>
  );
}
