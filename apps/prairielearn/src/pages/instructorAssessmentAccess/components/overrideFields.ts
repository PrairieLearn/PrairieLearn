import type { FieldPath } from 'react-hook-form';

import type { AccessControlFormData, OverridableFieldName } from './types.js';

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

export function isOverrideFieldActive(
  formValues: AccessControlFormData,
  index: number,
  fieldName: OverridableFieldName,
): boolean {
  return formValues.overrides[index]?.overriddenFields.includes(fieldName) ?? false;
}

export function getOverrideFieldPaths(
  index: number,
  fieldName: OverridableFieldName,
): FieldPath<AccessControlFormData>[] {
  return OVERRIDE_FIELD_PATH_SUFFIXES[fieldName].map(
    (suffix) => `overrides.${index}.${suffix}` as FieldPath<AccessControlFormData>,
  );
}

export function getOverrideFieldFromPath(
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

export function isFormFieldPathEditable(formValues: AccessControlFormData, path: string): boolean {
  const overrideField = getOverrideFieldFromPath(path);
  if (!overrideField) return true;
  if (!overrideField.fieldName) return true;
  return isOverrideFieldActive(formValues, overrideField.index, overrideField.fieldName);
}

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
