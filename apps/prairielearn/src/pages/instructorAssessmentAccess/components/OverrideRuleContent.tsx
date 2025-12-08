import { Form } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import { AfterCompleteForm } from './AfterCompleteForm.js';
import { DateControlForm } from './DateControlForm.js';
import type { AccessControlFormData } from './types.js';

interface OverrideRuleContentProps {
  control: Control<AccessControlFormData>;
  index: number;
  setValue: UseFormSetValue<AccessControlFormData>;
}

export function OverrideRuleContent({ control, index, setValue }: OverrideRuleContentProps) {
  const override = useWatch({
    control,
    name: `overrides.${index}`,
  });

  const { enabled: isEnabled, blockAccess } = override;

  return (
    <div>
      {isEnabled && (
        <Form.Group class="mb-3">
          <Form.Check
            type="checkbox"
            label="Block access"
            {...control.register(`overrides.${index}.blockAccess`)}
          />
          <Form.Text class="text-muted">Deny access if this rule applies</Form.Text>
        </Form.Group>
      )}

      {/* Effects Section - Only show if rule is enabled and doesn't block access */}
      {isEnabled && !blockAccess && (
        <div class="mb-3">
          {/* Date Control Section */}
          <DateControlForm
            control={control}
            namePrefix={`overrides.${index}`}
            setValue={setValue}
            title="Date Control"
            description="Control access and credit to your exam based on a schedule"
          />

          {/* After Completion Behavior Section */}
          <AfterCompleteForm
            control={control}
            namePrefix={`overrides.${index}`}
            setValue={setValue}
            title="After Completion Behavior"
            description="Configure what happens after students complete the assessment"
          />
        </div>
      )}
    </div>
  );
}
