import { Form, InputGroup } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { ToggleTitle } from '../ToggleTitle.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';

function DurationDetails({
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
    <>
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
    </>
  );
}

function validateDuration(value: number | null): string | true {
  if (value !== null && value < 1) return 'Duration must be at least 1 minute';
  return true;
}

function DurationToggle({
  value,
  onChange,
  idPrefix,
  showLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  idPrefix: string;
  showLabel?: boolean;
}) {
  return (
    <ToggleTitle
      id={`${idPrefix}-time-limit-enabled`}
      label="Time limit"
      checked={value !== null}
      showLabel={showLabel}
      onChange={(checked) => onChange(checked ? 60 : null)}
    />
  );
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
    <Form.Group>
      <DurationToggle value={field.value} idPrefix="mainRule" onChange={field.onChange} />
      <DurationDetails
        value={field.value}
        idPrefix="mainRule"
        error={error?.message}
        onChange={field.onChange}
      />
    </Form.Group>
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
      headerToggle={
        <DurationToggle
          value={field.value}
          idPrefix={`overrides-${index}`}
          showLabel={false}
          onChange={field.onChange}
        />
      }
    >
      <DurationDetails
        value={field.value}
        idPrefix={`overrides-${index}`}
        error={error?.message}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
