import { Alert, Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { run } from '@prairielearn/run';

import { PrairieTestControlForm } from './PrairieTestControlForm.js';
import type { AccessControlFormData } from './types.js';

export function IntegrationsSection() {
  const { clearErrors, setValue, trigger } = useFormContext<AccessControlFormData>();

  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });
  const password = useWatch<AccessControlFormData, 'defaultRule.password'>({
    name: 'defaultRule.password',
  });
  const durationMinutes = useWatch<AccessControlFormData, 'defaultRule.durationMinutes'>({
    name: 'defaultRule.durationMinutes',
  });

  const prairieTestEnabled = prairieTestExams.length > 0;
  const hasPassword = password != null;
  const hasDuration = durationMinutes != null;
  const conflictText = run(() => {
    if (hasPassword && hasDuration) {
      return 'The password and time limit set under "Date control" don\'t apply during PrairieTest reservations.';
    }
    if (hasPassword) {
      return 'The password set under "Date control" doesn\'t apply during PrairieTest reservations.';
    }
    if (hasDuration) {
      return 'The time limit set under "Date control" doesn\'t apply during PrairieTest reservations.';
    }
    return null;
  });

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
            clearErrors('defaultRule.prairieTestExams');
            // Trigger validation across the entire form so RHF prunes leftover
            // errors from PrairieTestControlForm's register()-based validators,
            // whose error entries (e.g. examUuid required) persist in
            // formState.errors even after the inputs unmount. A targeted
            // trigger('defaultRule.prairieTestExams') does not prune them.
            void trigger();
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
      {prairieTestEnabled && conflictText && (
        <Alert variant="info" className="mt-3">
          {conflictText}
        </Alert>
      )}
      {prairieTestEnabled && <PrairieTestControlForm />}
    </div>
  );
}
