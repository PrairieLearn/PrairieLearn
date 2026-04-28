import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import type { AccessControlFormData } from '../types.js';

function PasswordInput({
  value,
  onChange,
  idPrefix,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isInvalid = value !== null && value === '';
  const errorId = `${idPrefix}-password-error`;

  return (
    <Form.Group>
      <Form.Check
        type="checkbox"
        id={`${idPrefix}-password-enabled`}
        label={<strong>Password</strong>}
        checked={value !== null}
        onChange={({ currentTarget }) => onChange(currentTarget.checked ? '' : null)}
      />
      {value !== null && (
        <>
          <InputGroup className="mt-2">
            <Form.Control
              type={showPassword ? 'text' : 'password'}
              autoComplete="off"
              data-form-type="other"
              data-lpignore="true"
              aria-label="Assessment password"
              aria-invalid={isInvalid}
              aria-errormessage={isInvalid ? errorId : undefined}
              placeholder="Password"
              value={value}
              isInvalid={isInvalid}
              data-1p-ignore
              onChange={({ currentTarget }) => onChange(currentTarget.value)}
            />
            <Button
              variant="outline-secondary"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword(!showPassword)}
            >
              <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
            </Button>
          </InputGroup>
          {isInvalid && (
            <Form.Control.Feedback type="invalid" id={errorId} className="d-block">
              Password is required
            </Form.Control.Feedback>
          )}
        </>
      )}
      <Form.Text className="text-muted">
        {value !== null
          ? 'This password will be required to start the assessment.'
          : 'Require a password in order to start the assessment.'}
      </Form.Text>
    </Form.Group>
  );
}

export function MainPasswordField() {
  const { field } = useController<AccessControlFormData, 'mainRule.password'>({
    name: 'mainRule.password',
    rules: { validate: (v) => v !== '' || 'Password is required' },
  });

  return <PasswordInput value={field.value} idPrefix="mainRule" onChange={field.onChange} />;
}

export function OverridePasswordField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.password'>({
    name: 'mainRule.password',
  });

  const { field } = useController<AccessControlFormData, `overrides.${number}.password`>({
    name: `overrides.${index}.password`,
    rules: { validate: (v) => v !== '' || 'Password is required' },
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'password');

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Password"
      onOverride={() => {
        field.onChange(mainValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <PasswordInput
        value={field.value}
        idPrefix={`overrides-${index}`}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
