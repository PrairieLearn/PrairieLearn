import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { type Path, useController, useWatch } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import type { AccessControlFormData } from '../types.js';

interface PasswordInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
}

function PasswordInput({ value, onChange, idPrefix }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

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
        <InputGroup className="mt-2">
          <Form.Control
            type={showPassword ? 'text' : 'password'}
            aria-label="Assessment password"
            placeholder="Password"
            value={value}
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
  });

  return <PasswordInput value={field.value} idPrefix="mainRule" onChange={field.onChange} />;
}

export function OverridePasswordField({ index }: { index: number }) {
  const mainValue = useWatch<AccessControlFormData, 'mainRule.password'>({
    name: 'mainRule.password',
  });

  const { field } = useController({
    name: `overrides.${index}.password` as Path<AccessControlFormData>,
  });

  const value = field.value as string | null | undefined;
  const isOverridden = value !== undefined;

  const inheritedText = mainValue !== null ? 'Password protected' : 'No password';

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Password"
      inheritedValue={inheritedText}
      onOverride={() => field.onChange(mainValue)}
      onRemoveOverride={() => field.onChange(undefined)}
    >
      <PasswordInput
        value={value as string | null}
        idPrefix={`overrides-${index}`}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
