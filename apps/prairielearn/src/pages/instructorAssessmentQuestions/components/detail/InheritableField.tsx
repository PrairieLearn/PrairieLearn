import clsx from 'clsx';
import type React from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

import type { InheritanceSource } from '../../types.js';

/**
 * A form field that supports value inheritance from a parent scope
 * (e.g., zone → alt group → question). When `isInherited` is true, the field
 * displays a disabled input showing the inherited value with an "Override"
 * button. When overridden, an optional "Reset" button lets the user clear
 * the override and fall back to the inherited value.
 */
export function InheritableField({
  id,
  label,
  inputType = 'number',
  step,
  editMode = true,
  isInherited,
  inheritedDisplayValue,
  viewValue,
  registerProps,
  error,
  helpText,
  inheritedValueLabel,
  inheritedFromLabel = 'group',
  placeholder,
  onOverride,
  onReset,
  showResetButton,
}: {
  id: string;
  label: string;
  inputType?: 'number' | 'text';
  step?: string;
  editMode?: boolean;
  isInherited: boolean;
  inheritedDisplayValue: string;
  viewValue?: string;
  registerProps: UseFormRegisterReturn;
  error?: FieldError;
  helpText: React.ReactNode;
  inheritedValueLabel?: string;
  inheritedFromLabel?: InheritanceSource;
  placeholder?: string;
  onOverride: () => void;
  onReset: () => void;
  showResetButton: boolean;
}) {
  if (!editMode) {
    if (isInherited) {
      return (
        <>
          <dt>{label}</dt>
          <dd>
            {inheritedDisplayValue}{' '}
            <span className="text-muted">(inherited from {inheritedFromLabel})</span>
          </dd>
        </>
      );
    }
    if (viewValue != null) {
      return (
        <>
          <dt>{label}</dt>
          <dd>{viewValue}</dd>
        </>
      );
    }
    return null;
  }

  if (isInherited) {
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          {label}
        </label>
        <input type="hidden" {...registerProps} />
        <input
          type={inputType}
          className="form-control form-control-sm bg-light"
          id={id}
          value={inheritedDisplayValue}
          aria-describedby={`${id}-help`}
          disabled
        />
        <small id={`${id}-help`} className="form-text text-muted">
          Inherited from {inheritedFromLabel}.{' '}
          <button
            type="button"
            className="btn btn-link btn-sm p-0 align-baseline"
            onClick={onOverride}
          >
            Override
          </button>
        </small>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {showResetButton ? (
        <div className="input-group input-group-sm">
          <input
            type={inputType}
            className={clsx('form-control form-control-sm', error && 'is-invalid')}
            id={id}
            aria-invalid={!!error}
            aria-errormessage={error ? `${id}-error` : undefined}
            aria-describedby={`${id}-help`}
            step={step}
            placeholder={placeholder}
            {...registerProps}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            title={`Reset to ${inheritedFromLabel} value`}
            onClick={onReset}
          >
            <i className="bi bi-arrow-counterclockwise" />
          </button>
          {error && (
            <div id={`${id}-error`} className="invalid-feedback">
              {error.message}
            </div>
          )}
        </div>
      ) : (
        <>
          <input
            type={inputType}
            className={clsx('form-control form-control-sm', error && 'is-invalid')}
            id={id}
            aria-invalid={!!error}
            aria-errormessage={error ? `${id}-error` : undefined}
            aria-describedby={`${id}-help`}
            step={step}
            placeholder={placeholder}
            {...registerProps}
          />
          {error && (
            <div id={`${id}-error`} className="invalid-feedback">
              {error.message}
            </div>
          )}
        </>
      )}
      <small id={`${id}-help`} className="form-text text-muted">
        {showResetButton && inheritedValueLabel
          ? `Overrides ${inheritedFromLabel} value (${inheritedValueLabel}).`
          : helpText}
      </small>
    </div>
  );
}
