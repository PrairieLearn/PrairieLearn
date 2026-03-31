import { Form, InputGroup } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';

function DurationInput({
  value,
  onChange,
  idPrefix,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  idPrefix: string;
}) {
  return (
    <Form.Group>
      <Form.Check
        type="checkbox"
        id={`${idPrefix}-time-limit-enabled`}
        label={<strong>Time limit</strong>}
        checked={value !== null}
        onChange={({ currentTarget }) => onChange(currentTarget.checked ? 60 : null)}
      />
      {value !== null && (
        <InputGroup className="mt-2">
          <Form.Control
            type="number"
            aria-label="Duration in minutes"
            placeholder="Duration in minutes"
            min="1"
            value={value}
            onChange={({ currentTarget }) => {
              const num = Number(currentTarget.value);
              if (Number.isFinite(num) && num > 0) {
                onChange(num);
              }
            }}
          />
          <InputGroup.Text>minutes</InputGroup.Text>
        </InputGroup>
      )}
      <Form.Text className="text-muted">
        {value !== null
          ? `Students will have ${value} minutes to complete the assessment.`
          : 'Add a time limit to the assessment.'}
      </Form.Text>
    </Form.Group>
  );
}

export function MainDurationField() {
  const { field } = useController<AccessControlFormData, 'mainRule.durationMinutes'>({
    name: 'mainRule.durationMinutes',
  });

  return <DurationInput value={field.value} idPrefix="mainRule" onChange={field.onChange} />;
}

export function OverrideDurationField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.durationMinutes'>({
    name: 'mainRule.durationMinutes',
  });

  const { field } = useController({
    name: `overrides.${index}.durationMinutes` as Path<AccessControlFormData>,
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'durationMinutes');

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Time limit"
      onOverride={() => {
        field.onChange(mainValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <DurationInput
        value={field.value as number | null}
        idPrefix={`overrides-${index}`}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
