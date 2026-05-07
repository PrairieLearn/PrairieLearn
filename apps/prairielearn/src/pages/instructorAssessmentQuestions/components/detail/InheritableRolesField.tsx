import clsx from 'clsx';

import type { InheritanceSource } from '../../types.js';

/**
 * Multi-select editor for a `canView` / `canSubmit` array with inheritance
 * from a parent scope (assessment → zone → pool). Renders an inline list of
 * roles so all options and their selection state are visible without opening
 * a popover. When inherited, the list is read-only and an "Override" link
 * seeds the override from the inherited value; when overridden, a reset
 * control falls back to the parent.
 */
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
  hasRoles,
  groupsPageUrl,
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
  hasRoles: boolean;
  groupsPageUrl: string;
}) {
  if (!editMode) {
    if (!hasRoles) {
      return (
        <>
          <dt>{label}</dt>
          <dd className="text-muted">No custom group roles defined.</dd>
        </>
      );
    }
    const displayValue = isInherited ? (inheritedValue ?? allRoles) : value;
    const selectedSet = new Set(displayValue);
    return (
      <>
        <dt>
          {label}
          {isInherited && (
            <span className="text-muted fw-normal"> (inherited from {inheritedFromLabel})</span>
          )}
        </dt>
        <dd>
          <RoleChecklist allRoles={allRoles} selectedSet={selectedSet} ariaLabel={label} readOnly />
        </dd>
      </>
    );
  }

  if (!hasRoles) {
    return (
      <div className="mb-3">
        <div className="form-label">{label}</div>
        <small className="form-text text-muted">
          No custom group roles defined.{' '}
          <a href={groupsPageUrl}>Configure roles on the Groups page</a> to set per-zone or
          per-question permissions.
        </small>
      </div>
    );
  }

  const displayValue = isInherited ? (inheritedValue ?? allRoles) : value;
  const selectedSet = new Set(displayValue);

  return (
    <div className="mb-3">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="form-label mb-0" id={`${id}-label`}>
          {label}
          {isInherited && (
            <span className="text-muted fw-normal"> (inherited from {inheritedFromLabel})</span>
          )}
        </span>
        {!isInherited && (
          <button type="button" className="btn btn-link btn-sm p-0" onClick={onReset}>
            Reset to {inheritedFromLabel}
          </button>
        )}
      </div>
      <RoleChecklist
        allRoles={allRoles}
        selectedSet={selectedSet}
        ariaLabel={label}
        readOnly={isInherited}
        idPrefix={id}
        onToggle={(role, checked) => {
          const next = new Set(selectedSet);
          if (checked) next.add(role);
          else next.delete(role);
          // Prevent overrides from ending up with zero roles — deselecting
          // every role would hide the question from all students. To go back
          // to the inherited value, use the reset button.
          if (next.size === 0) return;
          onChange(Array.from(next));
        }}
      />
      <small id={`${id}-help`} className="form-text text-muted">
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
          helpText
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
  onToggle,
}: {
  allRoles: string[];
  selectedSet: Set<string>;
  ariaLabel: string;
  readOnly: boolean;
  idPrefix?: string;
  onToggle?: (role: string, checked: boolean) => void;
}) {
  return (
    <div className={clsx('list-group', readOnly && 'bg-light')} role="group" aria-label={ariaLabel}>
      {allRoles.map((role) => {
        const checkboxId = `${idPrefix}-${role}`;
        const selected = selectedSet.has(role);
        return (
          <label
            key={role}
            htmlFor={checkboxId}
            className={clsx('list-group-item py-1 px-2 m-0', readOnly && 'text-muted')}
          >
            <input
              id={checkboxId}
              type="checkbox"
              className="form-check-input me-2"
              checked={selected}
              disabled={readOnly}
              onChange={(e) => onToggle?.(role, e.target.checked)}
            />
            {role}
          </label>
        );
      })}
    </div>
  );
}
