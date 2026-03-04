import type { UseFormRegisterReturn } from 'react-hook-form';

export function InheritableCheckboxField({
  id,
  label,
  helpText,
  isInherited,
  inheritedValue,
  inheritedFromLabel,
  registerProps,
  showResetButton,
  onOverride,
  onReset,
}: {
  id: string;
  label: string;
  helpText: string;
  isInherited: boolean;
  inheritedValue: boolean;
  inheritedFromLabel: string;
  registerProps: UseFormRegisterReturn;
  showResetButton: boolean;
  onOverride: () => void;
  onReset: () => void;
}) {
  if (isInherited) {
    return (
      <div className="mb-3 form-check">
        <input type="hidden" {...registerProps} />
        <input
          type="checkbox"
          className="form-check-input"
          id={id}
          checked={inheritedValue}
          disabled
        />
        <label htmlFor={id} className="form-check-label">
          {label}
        </label>
        <small className="form-text text-muted d-block">
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
    <div className="mb-3 form-check">
      <input type="checkbox" className="form-check-input" id={id} {...registerProps} />
      <label htmlFor={id} className="form-check-label">
        {label}
      </label>
      <small id={`${id}-help`} className="form-text text-muted d-block">
        {showResetButton
          ? `Overrides ${inheritedFromLabel} value (${inheritedValue ? 'on' : 'off'}).`
          : helpText}
        {showResetButton && (
          <>
            {' '}
            <button
              type="button"
              className="btn btn-link btn-sm p-0 align-baseline"
              title={`Reset to ${inheritedFromLabel} value`}
              onClick={onReset}
            >
              Reset
            </button>
          </>
        )}
      </small>
    </div>
  );
}
