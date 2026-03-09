import type React from 'react';
import type { FieldError } from 'react-hook-form';

interface AriaProps {
  inputProps: {
    id: string;
    'aria-invalid'?: boolean;
    'aria-errormessage'?: string;
    'aria-describedby'?: string;
  };
  errorClass: string;
}

export function FormField({
  editMode,
  id,
  label,
  viewValue,
  hideWhenEmpty,
  error,
  helpText,
  children,
}: {
  editMode: boolean;
  id: string;
  label: string;
  viewValue?: React.ReactNode;
  hideWhenEmpty?: boolean;
  error?: FieldError;
  helpText?: React.ReactNode;
  children: (aria: AriaProps) => React.ReactNode;
}) {
  if (!editMode) {
    if (hideWhenEmpty && (viewValue == null || viewValue === '')) return null;
    return (
      <>
        <dt>{label}</dt>
        <dd>{viewValue ?? <span className="text-muted">&mdash;</span>}</dd>
      </>
    );
  }

  const aria: AriaProps = {
    inputProps: {
      id,
      ...(error && { 'aria-invalid': true as const }),
      ...(error && { 'aria-errormessage': `${id}-error` }),
      ...(helpText && { 'aria-describedby': `${id}-help` }),
    },
    errorClass: error ? 'is-invalid' : '',
  };

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {children(aria)}
      {error && (
        <div id={`${id}-error`} className="invalid-feedback">
          {error.message}
        </div>
      )}
      {helpText && (
        <small id={`${id}-help`} className="form-text text-muted">
          {helpText}
        </small>
      )}
    </div>
  );
}

export function FormCheckField({
  editMode,
  id,
  label,
  viewValue,
  hideWhenEmpty,
  error,
  helpText,
  children,
}: {
  editMode: boolean;
  id: string;
  label: string;
  viewValue?: boolean;
  hideWhenEmpty?: boolean;
  error?: FieldError;
  helpText?: React.ReactNode;
  children: (aria: AriaProps) => React.ReactNode;
}) {
  if (!editMode) {
    if (hideWhenEmpty && !viewValue) return null;
    return (
      <>
        <dt>{label}</dt>
        <dd>{viewValue ? 'Yes' : 'No'}</dd>
      </>
    );
  }

  const aria: AriaProps = {
    inputProps: {
      id,
      ...(error && { 'aria-invalid': true as const }),
      ...(error && { 'aria-errormessage': `${id}-error` }),
      ...(helpText && { 'aria-describedby': `${id}-help` }),
    },
    errorClass: error ? 'is-invalid' : '',
  };

  return (
    <div className="mb-3 form-check">
      {children(aria)}
      <label htmlFor={id} className="form-check-label">
        {label}
      </label>
      {error && (
        <div id={`${id}-error`} className="invalid-feedback">
          {error.message}
        </div>
      )}
      {helpText && (
        <small id={`${id}-help`} className="form-text text-muted d-block">
          {helpText}
        </small>
      )}
    </div>
  );
}
