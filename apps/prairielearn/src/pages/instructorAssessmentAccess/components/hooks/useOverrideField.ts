import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { AccessControlFormData, OverridableFieldName } from '../types.js';

/**
 * Hook that manages whether a single override field is active (overridden) or
 * inherited from the main rule.  The overridden state is tracked via the
 * `overriddenFields` string array on the override – not by setting the value
 * to `undefined`, which react-hook-form does not support.
 */
export function useOverrideField(index: number, fieldName: OverridableFieldName) {
  const { setValue, getValues, trigger } = useFormContext<AccessControlFormData>();

  const overriddenFields = useWatch<AccessControlFormData, `overrides.${number}.overriddenFields`>({
    name: `overrides.${index}.overriddenFields`,
  });

  const isOverridden = overriddenFields.includes(fieldName);

  const addOverride = useCallback(() => {
    const current = getValues(`overrides.${index}.overriddenFields`);
    if (!current.includes(fieldName)) {
      setValue(`overrides.${index}.overriddenFields`, [...current, fieldName], {
        shouldDirty: true,
      });
      // Re-validate the field now that it's overridden so errors surface immediately.
      void trigger(`overrides.${index}.${fieldName}`);
    }
  }, [index, fieldName, setValue, getValues, trigger]);

  const removeOverride = useCallback(() => {
    const current = getValues(`overrides.${index}.overriddenFields`);
    setValue(
      `overrides.${index}.overriddenFields`,
      current.filter((f) => f !== fieldName),
      { shouldDirty: true },
    );
    // Re-validate the field so its validator sees it's no longer overridden and clears errors.
    void trigger(`overrides.${index}.${fieldName}`);
  }, [index, fieldName, setValue, getValues, trigger]);

  return { isOverridden, addOverride, removeOverride };
}
