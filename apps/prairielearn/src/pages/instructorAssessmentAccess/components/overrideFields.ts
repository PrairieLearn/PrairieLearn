import type { AccessControlFormData, OverridableFieldName } from './types.js';

const OVERRIDE_FIELD_NAMES = new Set(
  Object.keys({
    release: true,
    due: true,
    earlyDeadlines: true,
    lateDeadlines: true,
    afterLastDeadline: true,
    durationMinutes: true,
    password: true,
    questionVisibility: true,
    scoreVisibility: true,
  } satisfies Record<OverridableFieldName, true>) as OverridableFieldName[],
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
