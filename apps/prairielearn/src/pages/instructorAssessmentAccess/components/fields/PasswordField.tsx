import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import { useController, useWatch } from 'react-hook-form';

import { useAccessControlRuleEditable } from '../AccessControlEditabilityContext.js';
import { FieldWrapper } from '../FieldWrapper.js';
import { ToggleTitle } from '../ToggleTitle.js';
import { useOverrideField } from '../hooks/useOverrideField.js';
import { validateActiveOverrideField } from '../overrideFields.js';
import type { AccessControlFormData } from '../types.js';

function PasswordToggle({
  value,
  onChange,
  idPrefix,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  return (
    <ToggleTitle
      id={`${idPrefix}-password-enabled`}
      label="Password"
      checked={value !== null}
      disabled={!ruleEditable}
      onChange={(checked) => onChange(checked ? '' : null)}
    />
  );
}

function PasswordDetails({
  value,
  onChange,
  idPrefix,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  idPrefix: string;
}) {
  const ruleEditable = useAccessControlRuleEditable();
  const [showPassword, setShowPassword] = useState(false);
  const isInvalid = value !== null && value === '';
  const errorId = `${idPrefix}-password-error`;

  return (
    <>
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
              disabled={!ruleEditable}
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
    </>
  );
}

export function DefaultPasswordField() {
  const { field } = useController<AccessControlFormData, 'defaultRule.password'>({
    name: 'defaultRule.password',
    rules: { validate: (v) => v !== '' || 'Password is required' },
  });

  return (
    <Form.Group>
      <PasswordToggle value={field.value} idPrefix="defaultRule" onChange={field.onChange} />
      <PasswordDetails value={field.value} idPrefix="defaultRule" onChange={field.onChange} />
    </Form.Group>
  );
}

export function OverridePasswordField({ index }: { index: number }) {
  const defaultRuleValue = useWatch<AccessControlFormData, 'defaultRule.password'>({
    name: 'defaultRule.password',
  });

  const { field } = useController<AccessControlFormData, `overrides.${number}.password`>({
    name: `overrides.${index}.password`,
    rules: {
      validate: validateActiveOverrideField(
        index,
        'password',
        (value) => value !== '' || 'Password is required',
      ),
    },
  });

  const { isOverridden, addOverride, removeOverride } = useOverrideField(index, 'password');

  return (
    <FieldWrapper
      isOverridden={isOverridden}
      label="Password"
      headerToggle={
        <PasswordToggle
          value={field.value}
          idPrefix={`overrides-${index}`}
          onChange={field.onChange}
        />
      }
      onOverride={() => {
        field.onChange(defaultRuleValue);
        addOverride();
      }}
      onRemoveOverride={removeOverride}
    >
      <PasswordDetails
        value={field.value}
        idPrefix={`overrides-${index}`}
        onChange={field.onChange}
      />
    </FieldWrapper>
  );
}
