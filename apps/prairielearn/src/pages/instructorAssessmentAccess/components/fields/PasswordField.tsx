import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { type Control, type UseFormSetValue } from 'react-hook-form';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type { AccessControlFormData } from '../types.js';

type NamePrefix = 'mainRule' | `overrides.${number}`;

interface PasswordFieldProps {
  control: Control<AccessControlFormData>;
  setValue: UseFormSetValue<AccessControlFormData>;
  namePrefix: NamePrefix;
}

export function PasswordField({ control, setValue, namePrefix }: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  const { field, isOverrideRule, setField, enableOverride, removeOverride, toggleEnabled } =
    useOverridableField({
      control,
      setValue,
      namePrefix,
      fieldPath: 'dateControl.password',
      defaultValue: '',
    });

  const headerContent = (
    <div className="d-flex align-items-center">
      <Form.Check
        type="checkbox"
        className="me-2"
        checked={field.isEnabled}
        onChange={({ currentTarget }) => toggleEnabled(currentTarget.checked)}
      />
      <strong>Password</strong>
    </div>
  );

  const content = (
    <Form.Group>
      {field.isEnabled && (
        <InputGroup>
          <Form.Control
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={field.value}
            onChange={({ currentTarget }) => setField({ value: currentTarget.value })}
          />
          <Button variant="outline-secondary" onClick={() => setShowPassword(!showPassword)}>
            <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
          </Button>
        </InputGroup>
      )}
      <Form.Text className="text-muted">
        {field.isEnabled
          ? 'This password will be required to start the assessment.'
          : 'Require a password in order to start the assessment.'}
      </Form.Text>
    </Form.Group>
  );

  return (
    <FieldWrapper
      isOverrideRule={isOverrideRule}
      isOverridden={field.isOverridden}
      label="Password"
      headerContent={headerContent}
      onOverride={() => enableOverride('')}
      onRemoveOverride={removeOverride}
    >
      {content}
    </FieldWrapper>
  );
}
