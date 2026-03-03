import clsx from 'clsx';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

export function InheritableField({
  id,
  label,
  inputType = 'number',
  step,
  isInherited,
  inheritedDisplayValue,
  registerProps,
  error,
  helpText,
  inheritedValueLabel,
  onOverride,
  onReset,
  showResetButton,
}: {
  id: string;
  label: string;
  inputType?: 'number' | 'text';
  step?: string;
  isInherited: boolean;
  inheritedDisplayValue: string;
  registerProps: UseFormRegisterReturn;
  error?: FieldError;
  helpText: string;
  inheritedValueLabel?: string;
  onOverride: () => void;
  onReset: () => void;
  showResetButton: boolean;
}) {
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
          disabled
        />
        <small className="form-text text-muted">
          Inherited from group.{' '}
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
            step={step}
            {...registerProps}
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            title="Reset to group value"
            onClick={onReset}
          >
            <i className="bi bi-arrow-counterclockwise" />
          </button>
          {error && <div className="invalid-feedback">{error.message}</div>}
        </div>
      ) : (
        <>
          <input
            type={inputType}
            className={clsx('form-control form-control-sm', error && 'is-invalid')}
            id={id}
            step={step}
            {...registerProps}
          />
          {error && <div className="invalid-feedback">{error.message}</div>}
        </>
      )}
      <small className="form-text text-muted">
        {showResetButton && inheritedValueLabel
          ? `Overrides group value (${inheritedValueLabel}).`
          : helpText}
      </small>
    </div>
  );
}
