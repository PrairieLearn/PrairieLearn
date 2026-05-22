import { useCallback } from 'react';
import { type FieldPath, useFormContext, useWatch } from 'react-hook-form';

import type { AccessControlFormData, OverridableFieldName } from '../types.js';

function getOverrideFieldErrorPaths(
  index: number,
  fieldName: OverridableFieldName,
): FieldPath<AccessControlFormData>[] {
  const prefix = `overrides.${index}` as const;

  switch (fieldName) {
    case 'release':
      return [`${prefix}.release`, `${prefix}.release.date`, `${prefix}.release.released`];
    case 'due':
      return [`${prefix}.due`, `${prefix}.due.date`, `${prefix}.due.credit`];
    case 'earlyDeadlines':
      return [`${prefix}.earlyDeadlines`];
    case 'lateDeadlines':
      return [`${prefix}.lateDeadlines`];
    case 'afterLastDeadline':
      return [`${prefix}.afterLastDeadline`, `${prefix}.afterLastDeadline.credit`];
    case 'durationMinutes':
      return [`${prefix}.durationMinutes`];
    case 'password':
      return [`${prefix}.password`];
    case 'questionVisibility':
      return [
        `${prefix}.questionVisibility`,
        `${prefix}.questionVisibility.visibleFromDate`,
        `${prefix}.questionVisibility.visibleUntilDate`,
      ];
    case 'scoreVisibility':
      return [`${prefix}.scoreVisibility`, `${prefix}.scoreVisibility.visibleFromDate`];
  }
}

/**
 * Hook that manages whether a single override field is active (overridden) or
 * inherited from the default rule.  The overridden state is tracked via the
 * `overriddenFields` string array on the override – not by setting the value
 * to `undefined`, which react-hook-form does not support.
 */
export function useOverrideField(index: number, fieldName: OverridableFieldName) {
  const { setValue, getValues, clearErrors, trigger } = useFormContext<AccessControlFormData>();

  const overriddenFields = useWatch<AccessControlFormData, `overrides.${number}.overriddenFields`>({
    name: `overrides.${index}.overriddenFields`,
  });

  const isOverridden = overriddenFields.includes(fieldName);

  const addOverride = useCallback(() => {
    const current = getValues(`overrides.${index}.overriddenFields`);
    if (!current.includes(fieldName)) {
      setValue(`overrides.${index}.overriddenFields`, [...current, fieldName], {
        shouldDirty: true,
        shouldValidate: true,
      });
      void trigger(getOverrideFieldErrorPaths(index, fieldName));
    }
  }, [index, fieldName, setValue, getValues, trigger]);

  const removeOverride = useCallback(() => {
    const current = getValues(`overrides.${index}.overriddenFields`);
    setValue(
      `overrides.${index}.overriddenFields`,
      current.filter((f) => f !== fieldName),
      { shouldDirty: true, shouldValidate: true },
    );
    const paths = getOverrideFieldErrorPaths(index, fieldName);
    clearErrors(paths);
    void trigger(paths);
  }, [index, fieldName, setValue, getValues, clearErrors, trigger]);

  return { isOverridden, addOverride, removeOverride };
}
