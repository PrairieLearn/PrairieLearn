import { Button, Form } from 'react-bootstrap';
import { useFormContext, useWatch } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import { DefaultAfterCompleteForm } from './AfterCompleteForm.js';
import { DefaultDateControlForm } from './DateControlForm.js';
import { IntegrationsSection } from './IntegrationsSection.js';
import { type AccessControlFormData, defaultRuleHasCompletionMechanism } from './types.js';

const beforeReleasePopoverConfig = {
  header: 'What does "before release" mean?',
  body: (
    <ul className="mb-0">
      <li>If date control is enabled, this is the period before the release date.</li>
      <li>If PrairieTest is enabled, this is before the exam is closed.</li>
      <li>If neither is enabled and this is checked, the assessment is always listed.</li>
    </ul>
  ),
  props: { id: 'before-release-info-popover' },
};

export function DefaultRuleForm({
  displayTimezone,
  isExam,
}: {
  displayTimezone: string;
  isExam: boolean;
}) {
  const { register } = useFormContext<AccessControlFormData>();
  const dateControlEnabled = useWatch<AccessControlFormData, 'defaultRule.dateControlEnabled'>({
    name: 'defaultRule.dateControlEnabled',
  });
  const due = useWatch<AccessControlFormData, 'defaultRule.due'>({ name: 'defaultRule.due' });
  const lateDeadlines = useWatch<AccessControlFormData, 'defaultRule.lateDeadlines'>({
    name: 'defaultRule.lateDeadlines',
  });
  const durationMinutes = useWatch<AccessControlFormData, 'defaultRule.durationMinutes'>({
    name: 'defaultRule.durationMinutes',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });
  const hasCompletionMechanism = defaultRuleHasCompletionMechanism({
    dateControlEnabled,
    due,
    lateDeadlines,
    durationMinutes,
    prairieTestExams,
  });

  return (
    <div className="d-flex flex-column gap-3">
      <DefaultDateControlForm displayTimezone={displayTimezone} isExam={isExam} />
      <IntegrationsSection />
      <div>
        <div className="d-flex align-items-center section-header mb-3">
          <strong>Before release</strong>
          <OverlayTrigger trigger="click" placement="auto" popover={beforeReleasePopoverConfig}>
            <Button
              variant="link"
              size="sm"
              className="ms-2 p-0"
              aria-label="What does before release mean?"
            >
              <i className="bi bi-info-circle" aria-hidden="true" />
            </Button>
          </OverlayTrigger>
        </div>
        <Form.Check
          type="checkbox"
          id="defaultRule-before-release-listed"
          label={<strong>List before release</strong>}
          {...register('defaultRule.beforeReleaseListed')}
          aria-describedby="defaultRule-before-release-listed-help"
        />
        <Form.Text id="defaultRule-before-release-listed-help" className="text-muted">
          Students can see the assessment title before release
        </Form.Text>
      </div>
      {hasCompletionMechanism && <DefaultAfterCompleteForm displayTimezone={displayTimezone} />}
    </div>
  );
}
