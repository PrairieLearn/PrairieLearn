import { Form, InputGroup } from 'react-bootstrap';
import { type Control, type UseFormSetValue } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type { AccessControlFormData } from '../types.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface DurationFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
}

export function DurationField({ control, setValue, namePrefix }: DurationFieldProps) {
  const { field, isOverrideRule, setField, enableOverride, removeOverride, toggleEnabled } =
    useOverridableField({
      control,
      setValue,
      namePrefix,
      fieldPath: 'dateControl.durationMinutes',
      defaultValue: 60,
    });

  const content = (
    <Form.Group>
      <div class="d-flex align-items-center mb-2">
        <Form.Check
          type="checkbox"
          class="me-2"
          checked={field.isEnabled}
          onChange={(e) => toggleEnabled((e.target as HTMLInputElement).checked)}
        />
        <Form.Label class="mb-0">Time limit</Form.Label>
      </div>
      {field.isEnabled && (
        <InputGroup>
          <Form.Control
            type="number"
            placeholder="Duration in minutes"
            min="1"
            value={field.value}
            onChange={(e) =>
              setField({ value: Number((e.target as HTMLInputElement).value) || 60 })
            }
          />
          <InputGroup.Text>minutes</InputGroup.Text>
        </InputGroup>
      )}
      <Form.Text class="text-muted">
        {field.isEnabled
          ? `Students will have ${field.value || 60} minutes to complete the assessment.`
          : 'Add a time limit to the assessment.'}
      </Form.Text>
    </Form.Group>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label="Time Limit"
      onOverride={() => enableOverride(60)}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
