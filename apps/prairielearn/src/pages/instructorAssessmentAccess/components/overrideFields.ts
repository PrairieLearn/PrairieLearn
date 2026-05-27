import type { FieldPath } from 'react-hook-form';

import type { AccessControlFormData, OverridableFieldName } from './types.js';

/**
 * Form-state paths owned by each overridable field, relative to
 * `overrides.${index}`. The first entry is the field itself; subsequent
 * entries are sub-fields that can hold their own validation errors. Keeping
 * these in one place lets us clear, re-trigger, or check editability for
 * every relevant path when an override is toggled on or off — see
 * `getOverrideFieldPaths` and `isFormFieldPathEditable`.
 */
const OVERRIDE_FIELD_PATH_SUFFIXES: Record<OverridableFieldName, readonly string[]> = {
  release: ['release', 'release.date', 'release.released'],
  due: ['due', 'due.date', 'due.credit'],
  earlyDeadlines: ['earlyDeadlines'],
  lateDeadlines: ['lateDeadlines'],
  afterLastDeadline: ['afterLastDeadline', 'afterLastDeadline.credit'],
  durationMinutes: ['durationMinutes'],
  password: ['password'],
  questionVisibility: [
    'questionVisibility',
    'questionVisibility.visibleFromDate',
    'questionVisibility.visibleUntilDate',
  ],
  scoreVisibility: ['scoreVisibility', 'scoreVisibility.visibleFromDate'],
};

const OVERRIDE_FIELD_NAMES = new Set<OverridableFieldName>(
  Object.keys(OVERRIDE_FIELD_PATH_SUFFIXES) as OverridableFieldName[],
);

/**
 * Whether the override at `index` is currently overriding `fieldName`. An
 * override field is "active" iff the field name appears in the override's
 * `overriddenFields` array; inactive fields inherit from the default rule
 * and should not contribute validation errors.
 */
export function isOverrideFieldActive(
  formValues: AccessControlFormData,
  index: number,
  fieldName: OverridableFieldName,
): boolean {
  return formValues.overrides[index]?.overriddenFields.includes(fieldName) ?? false;
}

/**
 * All form paths owned by the given override field, for use with
 * `trigger(...)` and `clearErrors(...)`. Use this when toggling an override
 * on/off so that errors on the field and any of its sub-fields are
 * re-evaluated atomically.
 */
export function getOverrideFieldPaths(
  index: number,
  fieldName: OverridableFieldName,
): FieldPath<AccessControlFormData>[] {
  return OVERRIDE_FIELD_PATH_SUFFIXES[fieldName].map(
    (suffix) => `overrides.${index}.${suffix}` as FieldPath<AccessControlFormData>,
  );
}

function getOverrideFieldFromPath(
  path: string,
): { index: number; fieldName: OverridableFieldName | null } | null {
  const match = /^overrides\.(\d+)\.(.+)$/.exec(path);
  if (!match) return null;

  const fieldName = match[2].split('.')[0] as OverridableFieldName;
  return {
    index: Number(match[1]),
    fieldName: OVERRIDE_FIELD_NAMES.has(fieldName) ? fieldName : null,
  };
}

/**
 * Whether the given form path corresponds to a UI input the user can
 * currently edit. Paths under an inactive override field have no visible
 * input, so surfacing errors against them is misleading — the form-level
 * validators use this to drop or remap such errors before displaying them.
 * Paths outside the override subtree are always considered editable.
 */
export function isFormFieldPathEditable(formValues: AccessControlFormData, path: string): boolean {
  const overrideField = getOverrideFieldFromPath(path);
  if (!overrideField) return true;
  if (!overrideField.fieldName) return true;
  return isOverrideFieldActive(formValues, overrideField.index, overrideField.fieldName);
}

/**
 * Wraps a `useController` `validate` function so it short-circuits to a
 * passing result when the override field is not active. Without this
 * wrapper, `useController` validators keep running for as long as the
 * component is mounted — even after the user removes the override — and
 * can produce phantom errors that block saving. Apply to every override
 * field validator; the default rule's validators do not need it.
 */
export function validateActiveOverrideField<T>(
  index: number,
  fieldName: OverridableFieldName,
  validate: (value: T, formValues: AccessControlFormData) => string | true,
): (value: T, formValues: AccessControlFormData) => string | true {
  return (value, formValues) => {
    if (!isOverrideFieldActive(formValues, index, fieldName)) return true;
    return validate(value, formValues);
  };
}
