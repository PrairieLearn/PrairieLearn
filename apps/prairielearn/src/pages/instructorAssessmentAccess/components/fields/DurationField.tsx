import { Form, InputGroup } from 'react-bootstrap';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type { NamePrefix } from '../hooks/useTypedFormWatch.js';

interface DurationFieldProps {
  namePrefix: NamePrefix;
}

export function DurationField({ namePrefix }: DurationFieldProps) {
  const { field, isOverrideRule, setField, enableOverride, removeOverride, toggleEnabled } =
    useOverridableField({
      namePrefix,
      fieldPath: 'dateControl.durationMinutes',
      defaultValue: 60,
    });

  const headerContent = (
    <Form.Check
      type="checkbox"
      id={`${namePrefix}-time-limit-enabled`}
      label={<strong>Time limit</strong>}
      checked={field.isEnabled}
      onChange={({ currentTarget }) => toggleEnabled(currentTarget.checked)}
    />
  );

  const content = (
    <Form.Group>
      {field.isEnabled && (
        <InputGroup>
          <Form.Control
            type="number"
            aria-label="Duration in minutes"
            placeholder="Duration in minutes"
            min="1"
            value={field.value}
            onChange={({ currentTarget }) => setField({ value: Number(currentTarget.value) || 60 })}
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
