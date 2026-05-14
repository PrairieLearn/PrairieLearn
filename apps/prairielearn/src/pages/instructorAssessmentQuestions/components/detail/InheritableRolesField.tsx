import clsx from 'clsx';

import type { InheritanceSource } from '../../types.js';

export function InheritableRolesField({
  id,
  label,
  helpText,
  editMode = true,
  isInherited,
  inheritedValue,
  inheritedFromLabel,
  allRoles,
  value,
  onChange,
  onOverride,
  onReset,
}: {
  id: string;
  label: string;
  helpText: string;
  editMode?: boolean;
  isInherited: boolean;
  inheritedValue: string[] | undefined;
  inheritedFromLabel: InheritanceSource;
  allRoles: string[];
  value: string[];
  onChange: (next: string[]) => void;
  onOverride: () => void;
  onReset: () => void;
}) {
  const displayValue = isInherited ? (inheritedValue ?? allRoles) : value;
  const selectedSet = new Set(displayValue);

  if (!editMode) {
    return (
      <>
        <dt>
          {label}
          {isInherited && (
            <span className="text-muted fw-normal"> (inherited from {inheritedFromLabel})</span>
          )}
        </dt>
        <dd>
          <RoleChecklist
            allRoles={allRoles}
            selectedSet={selectedSet}
            ariaLabel={label}
            idPrefix={id}
            readOnly
          />
        </dd>
      </>
    );
  }

  return (
    <div className="mb-3">
      <div className="form-label" id={`${id}-label`}>
        {label}
      </div>
      <RoleChecklist
        allRoles={allRoles}
        selectedSet={selectedSet}
        ariaLabel={label}
        readOnly={isInherited}
        idPrefix={id}
        disableUncheckingLast={!isInherited}
        onToggle={(role, checked) => {
          const next = new Set(selectedSet);
          if (checked) next.add(role);
          else next.delete(role);
          onChange(Array.from(next));
        }}
      />
      <small id={`${id}-help`} className="form-text text-muted">
        {helpText}{' '}
        {isInherited ? (
          <>
            Inherited from {inheritedFromLabel}.{' '}
            <button
              type="button"
              className="btn btn-link btn-sm p-0 align-baseline"
              onClick={onOverride}
            >
              Override
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 align-baseline"
            onClick={onReset}
          >
            Inherit from {inheritedFromLabel}
          </button>
        )}
      </small>
    </div>
  );
}

function RoleChecklist({
  allRoles,
  selectedSet,
  ariaLabel,
  readOnly,
  idPrefix,
  disableUncheckingLast,
  onToggle,
}: {
  allRoles: string[];
  selectedSet: Set<string>;
  ariaLabel: string;
  readOnly: boolean;
  idPrefix?: string;
  disableUncheckingLast?: boolean;
  onToggle?: (role: string, checked: boolean) => void;
}) {
  const isLastSelected = disableUncheckingLast && selectedSet.size === 1;
  return (
    <div className={clsx('list-group', readOnly && 'bg-light')} role="group" aria-label={ariaLabel}>
      {allRoles.map((role) => {
        const checkboxId = `${idPrefix}-${role}`;
        const selected = selectedSet.has(role);
        const disabled = readOnly || (isLastSelected && selected);
        return (
          <label
            key={role}
            htmlFor={checkboxId}
            className={clsx('list-group-item py-1 px-2 m-0', readOnly && 'text-muted')}
            title={isLastSelected && selected ? 'At least one role must be selected.' : undefined}
          >
            <input
              id={checkboxId}
              type="checkbox"
              className="form-check-input me-2"
              checked={selected}
              disabled={disabled}
              onChange={(e) => onToggle?.(role, e.target.checked)}
            />
            {role}
          </label>
        );
      })}
    </div>
  );
}
