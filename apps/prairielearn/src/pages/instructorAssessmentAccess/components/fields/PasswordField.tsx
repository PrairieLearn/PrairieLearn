import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';

import { FieldWrapper } from '../FieldWrapper.js';
import { useOverridableField } from '../hooks/useOverridableField.js';
import type { NamePrefix } from '../hooks/useTypedFormWatch.js';

interface PasswordFieldProps {
  namePrefix: NamePrefix;
}

export function PasswordField({ namePrefix }: PasswordFieldProps) {
  const [showPassword, setShowPassword] = useState(false);

  const { field, isOverrideRule, setField, enableOverride, removeOverride, toggleEnabled } =
    useOverridableField({
      namePrefix,
      fieldPath: 'dateControl.password',
      defaultValue: '',
    });

  const headerContent = (
    <Form.Check
      type="checkbox"
      id={`${namePrefix}-password-enabled`}
      label={<strong>Password</strong>}
      checked={field.isEnabled}
      onChange={({ currentTarget }) => toggleEnabled(currentTarget.checked)}
    />
  );

  const content = (
    <Form.Group>
      {field.isEnabled && (
        <InputGroup>
          <Form.Control
            type={showPassword ? 'text' : 'password'}
            aria-label="Assessment password"
            placeholder="Password"
            value={field.value}
            onChange={({ currentTarget }) => setField({ value: currentTarget.value })}
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
