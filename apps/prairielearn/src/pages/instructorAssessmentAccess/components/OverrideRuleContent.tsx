import { Form } from 'react-bootstrap';
import { useFormContext } from 'react-hook-form';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import { type NamePrefix, useWatchField } from './hooks/useTypedFormWatch.js';
import type { AccessControlFormData } from './types.js';

interface OverrideRuleContentProps {
  index: number;
}

export function OverrideRuleContent({ index }: OverrideRuleContentProps) {
  const { register } = useFormContext<AccessControlFormData>();
  const namePrefix: NamePrefix = `overrides.${index}`;

  const isEnabled = useWatchField<boolean>(namePrefix, 'enabled');

  const blockAccess = useWatchField<boolean>(namePrefix, 'blockAccess');

  return (
    <div>
      {isEnabled && (
        <Form.Group className="mb-3">
          <Form.Check
            type="checkbox"
            id={`overrides-${index}-block-access`}
            label="Block access"
            {...register(`overrides.${index}.blockAccess`)}
            aria-describedby={`overrides-${index}-block-access-help`}
          />
          <Form.Text id={`overrides-${index}-block-access-help`} className="text-muted">
            Deny access if this rule applies
          </Form.Text>
        </Form.Group>
      )}

      {isEnabled && !blockAccess && (
        <div className="mb-3">
          <DateControlForm
            namePrefix={`overrides.${index}`}
            title="Date control"
            description="Control access and credit to your exam based on a schedule"
          />

          <AfterCompleteForm
            namePrefix={`overrides.${index}`}
            title="After completion behavior"
            description="Configure what happens after students complete the assessment"
          />
        </div>
      )}
    </div>
  );
}
