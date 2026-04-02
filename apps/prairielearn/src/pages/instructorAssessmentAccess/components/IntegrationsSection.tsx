import { useEffect } from 'react';
import { Card, Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

export function IntegrationsSection() {
  const { register, setValue, getValues } = useFormContext<AccessControlFormData>();

  const prairieTestEnabled = useWatch<AccessControlFormData, 'mainRule.prairieTestEnabled'>({
    name: 'mainRule.prairieTestEnabled',
  });

  const prairieTestRegistration = register('mainRule.prairieTestEnabled');

  // When PT is enabled and there are no exams, auto-add one empty entry.
  useEffect(() => {
    if (prairieTestEnabled && getValues('mainRule.prairieTestExams').length === 0) {
      setValue('mainRule.prairieTestExams', [{ examUuid: '', readOnly: false }], {
        shouldDirty: true,
      });
    }
  }, [prairieTestEnabled, getValues, setValue]);

  return (
    <Card className="mb-4">
      <Card.Header>
        <Form.Check
          type="checkbox"
          id="mainRule-prairietest-enabled"
          label="PrairieTest"
          defaultChecked={prairieTestEnabled}
          {...prairieTestRegistration}
          aria-describedby="mainRule-prairietest-help"
          onChange={(e) => {
            void prairieTestRegistration.onChange(e);
            if (!e.target.checked) {
              setValue('mainRule.prairieTestExams', [], { shouldDirty: true });
            }
          }}
        />
        <Form.Text id="mainRule-prairietest-help" className="text-muted">
          Control access to your assessment through PrairieTest exams
        </Form.Text>
      </Card.Header>
      {prairieTestEnabled && (
        <Card.Body>
          <PrairieTestControlForm />
        </Card.Body>
      )}
    </Card>
  );
}
