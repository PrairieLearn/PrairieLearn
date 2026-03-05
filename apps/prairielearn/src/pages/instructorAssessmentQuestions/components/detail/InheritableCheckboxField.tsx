import type { UseFormRegisterReturn } from 'react-hook-form';

import type { InheritanceSource } from '../../types.js';

export function InheritableCheckboxField({
  id,
  label,
  helpText,
  editMode = true,
  isInherited,
  inheritedValue,
  inheritedFromLabel,
  viewValue,
  registerProps,
  showResetButton,
  onOverride,
  onReset,
}: {
  id: string;
  label: string;
  helpText: string;
  editMode?: boolean;
  isInherited: boolean;
  inheritedValue: boolean;
  inheritedFromLabel: InheritanceSource;
  viewValue?: boolean;
  registerProps: UseFormRegisterReturn;
  showResetButton: boolean;
  onOverride: () => void;
  onReset: () => void;
}) {
  if (!editMode) {
    if (isInherited) {
      return (
        <>
          <dt>{label}</dt>
          <dd>
            {inheritedValue ? 'Yes' : 'No'}{' '}
            <span className="text-muted">(inherited from {inheritedFromLabel})</span>
          </dd>
        </>
      );
    }
    if (viewValue != null) {
      return (
        <>
          <dt>{label}</dt>
          <dd>{viewValue ? 'Yes' : 'No'}</dd>
        </>
      );
    }
    return null;
  }

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
