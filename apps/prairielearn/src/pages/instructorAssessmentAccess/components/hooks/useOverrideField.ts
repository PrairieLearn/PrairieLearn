import { useCallback } from 'react';
import { type Path, useFormContext, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from '../types.js';

/**
 * Hook that manages whether a single override field is active (overridden) or
 * inherited from the main rule.  The overridden state is tracked via the
 * `overriddenFields` string array on the override – not by setting the value
 * to `undefined`, which react-hook-form does not support.
 */
export function useOverrideField(index: number, fieldName: string) {
  const { setValue, getValues } = useFormContext<AccessControlFormData>();

  const overriddenFields = useWatch({
    name: `overrides.${index}.overriddenFields` as Path<AccessControlFormData>,
  }) as string[];

  const isOverridden = overriddenFields.includes(fieldName);

  const addOverride = useCallback(() => {
    const current = getValues(
      `overrides.${index}.overriddenFields` as Path<AccessControlFormData>,
    ) as unknown as string[];
    if (!current.includes(fieldName)) {
      setValue(
        `overrides.${index}.overriddenFields` as Path<AccessControlFormData>,
        [...current, fieldName] as never,
        { shouldDirty: true },
      );
    }
  }, [index, fieldName, setValue, getValues]);

  const removeOverride = useCallback(() => {
    const current = getValues(
      `overrides.${index}.overriddenFields` as Path<AccessControlFormData>,
    ) as unknown as string[];
    setValue(
      `overrides.${index}.overriddenFields` as Path<AccessControlFormData>,
      current.filter((f) => f !== fieldName) as never,
      { shouldDirty: true },
    );
  }, [index, fieldName, setValue, getValues]);

  return { isOverridden, addOverride, removeOverride };
}
