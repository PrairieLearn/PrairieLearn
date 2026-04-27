import { FilterDropdown, type FilterItem } from '@prairielearn/ui';

import type { InheritanceSource } from '../../types.js';

function describeRoleList(roles: string[] | undefined): string {
  if (roles === undefined) return 'All roles';
  if (roles.length === 0) return 'No roles';
  return roles.join(', ');
}

/**
 * Multi-select editor for a `canView` / `canSubmit` array with inheritance
 * from a parent scope (assessment → zone → pool). When inherited, the
 * dropdown is disabled and an "Override" link seeds the override from the
 * inherited value; when overridden, a reset control falls back to the parent.
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
  const items: FilterItem[] = allRoles.map((name) => ({ id: name, name }));

  if (!editMode) {
    if (!hasRoles) {
      return (
        <>
          <dt>{label}</dt>
          <dd className="text-muted">No custom group roles defined.</dd>
        </>
      );
    }
    const displayValue = isInherited ? inheritedValue : value;
    const suffix = isInherited ? (
      <span className="text-muted"> (inherited from {inheritedFromLabel})</span>
    ) : null;
    return (
      <>
        <dt>{label}</dt>
        <dd>
          {describeRoleList(displayValue)}
          {suffix}
        </dd>
      </>
    );
  }

  if (!hasRoles) {
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          {label}
        </label>
        <div>
          <FilterDropdown
            label={label}
            items={[]}
            selectedIds={new Set()}
            aria-label={label}
            disabled
            onChange={() => {}}
          />
        </div>
        <small id={`${id}-help`} className="form-text text-muted">
          No custom group roles defined.{' '}
          <a href={groupsPageUrl}>Configure roles on the Groups page</a> to set per-zone or
          per-question permissions.
        </small>
      </div>
    );
  }

  if (isInherited) {
    return (
      <div className="mb-3">
        <label htmlFor={id} className="form-label">
          {label}
        </label>
        <div>
          <FilterDropdown
            label={describeRoleList(inheritedValue)}
            items={items}
            selectedIds={new Set(inheritedValue ?? allRoles)}
            aria-label={`${label} (inherited)`}
            disabled
            onChange={() => {}}
          />
        </div>
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

  const summary =
    value.length === allRoles.length ? 'All roles' : `${value.length} selected`;

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <div className="d-flex align-items-center gap-2">
        <FilterDropdown
          label={summary}
          items={items}
          selectedIds={new Set(value)}
          aria-label={label}
          onChange={(next) => {
            // Prevent overrides from ending up with zero roles — deselecting
            // every role would hide the question from all students. To go back
            // to the inherited value, use the reset button.
            if (next.size === 0) return;
            onChange(Array.from(next));
          }}
        />
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          title={`Reset to ${inheritedFromLabel} value`}
          onClick={onReset}
        >
          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
          <span className="visually-hidden">Reset to {inheritedFromLabel} value</span>
        </button>
      </div>
      <small id={`${id}-help`} className="form-text text-muted">
        {helpText}
      </small>
    </div>
  );
}
