import { Form } from 'react-bootstrap';
import { type Path, useFormContext, useWatch } from 'react-hook-form';

import { OverrideAfterCompleteForm } from './AfterCompleteForm.js';
import { OverrideDateControlForm } from './DateControlForm.js';
import type { AccessControlFormData } from './types.js';

interface OverrideRuleContentProps {
  index: number;
}

export function OverrideRuleContent({ index }: OverrideRuleContentProps) {
  const { register } = useFormContext<AccessControlFormData>();

  const isEnabled = useWatch({
    name: `overrides.${index}.enabled` as Path<AccessControlFormData>,
  }) as boolean | undefined;

  const blockAccess = useWatch({
    name: `overrides.${index}.blockAccess` as Path<AccessControlFormData>,
  }) as boolean | undefined;

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
          <OverrideDateControlForm
            index={index}
            title="Date control"
            description="Control access and credit to your exam based on a schedule"
          />

          <OverrideAfterCompleteForm
            index={index}
            title="After completion behavior"
            description="Configure what happens after students complete the assessment"
          />
        </div>
      )}
    </div>
  );
}
