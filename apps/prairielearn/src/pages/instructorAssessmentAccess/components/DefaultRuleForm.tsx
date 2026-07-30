import { Button, Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import { useAccessControlRuleEditable } from './AccessControlEditabilityContext.js';
import { DefaultAfterCompleteForm } from './AfterCompleteForm.js';
import { DefaultDateControlForm } from './DateControlForm.js';
import { IntegrationsSection } from './IntegrationsSection.js';
import { type AccessControlFormData } from './types.js';

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
  hasExamAutoClose,
}: {
  displayTimezone: string;
  isExam: boolean;
  hasExamAutoClose: boolean;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const { register } = useFormContext<AccessControlFormData>();

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
          disabled={!ruleEditable}
          {...register('defaultRule.beforeReleaseListed')}
          aria-describedby="defaultRule-before-release-listed-help"
        />
        <Form.Text id="defaultRule-before-release-listed-help" className="text-muted">
          Students can see the assessment title before release
        </Form.Text>
      </div>
      <DefaultAfterCompleteForm
        displayTimezone={displayTimezone}
        isExam={isExam}
        hasExamAutoClose={hasExamAutoClose}
      />
    </div>
  );
}
