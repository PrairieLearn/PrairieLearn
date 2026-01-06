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

  const headerContent = (
    <div className="d-flex align-items-center">
      <Form.Check
        type="checkbox"
        className="me-2"
        checked={field.isEnabled}
        onChange={(e) => toggleEnabled((e.target as HTMLInputElement).checked)}
      />
      <strong>Time limit</strong>
    </div>
  );

  const content = (
    <Form.Group>
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
      <Form.Text className="text-muted">
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
      label="Time limit"
      headerContent={headerContent}
      onOverride={() => enableOverride(60)}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
