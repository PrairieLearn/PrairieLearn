import { Form, InputGroup } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';

function DurationInput({
  value,
  onChange,
  idPrefix,
  error,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  idPrefix: string;
  error?: string;
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
        <>
          <InputGroup className="mt-2">
            <Form.Control
              type="number"
              aria-label="Duration in minutes"
              aria-invalid={!!error}
              placeholder="Duration in minutes"
              value={value || ''}
              isInvalid={!!error}
              aria-errormessage={error ? `${idPrefix}-duration-error` : undefined}
              onChange={({ currentTarget }) => {
                if (currentTarget.value === '') {
                  onChange(0);
                } else {
                  const num = Number(currentTarget.value);
                  if (Number.isFinite(num) && num >= 0) {
                    onChange(num);
                  }
                }
              }}
            />
            <InputGroup.Text>minutes</InputGroup.Text>
          </InputGroup>
          {error && (
            <Form.Text id={`${idPrefix}-duration-error`} className="text-danger" role="alert">
              {error}
            </Form.Text>
          )}
        </>
      )}
      {!error && (
        <Form.Text className="text-muted">
          {value !== null && value > 0
            ? `Students will have ${value} minutes to complete the assessment.`
            : value !== null
              ? 'Enter a duration in minutes.'
              : 'Add a time limit to the assessment.'}
        </Form.Text>
      )}
    </Form.Group>
  );
}

function validateDuration(value: number | null): string | true {
  if (value !== null && value < 1) return 'Duration must be at least 1 minute';
  return true;
}

export function MainDurationField() {
  const {
    field,
    fieldState: { error },
  } = useController<AccessControlFormData, 'mainRule.durationMinutes'>({
    name: 'mainRule.durationMinutes',
    rules: { validate: validateDuration },
  });

  return (
    <DurationInput
      value={field.value}
      idPrefix="mainRule"
      error={error?.message}
      onChange={field.onChange}
    />
  );
}

export function OverrideDurationField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.durationMinutes'>({
    name: 'mainRule.durationMinutes',
  });

  const {
    field,
    fieldState: { error },
  } = useController<AccessControlFormData, `overrides.${number}.durationMinutes`>({
    name: `overrides.${index}.durationMinutes`,
    rules: { validate: validateDuration },
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
        value={field.value}
        idPrefix={`overrides-${index}`}
        error={error?.message}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
