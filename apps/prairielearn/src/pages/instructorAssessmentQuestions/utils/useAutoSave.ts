import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormGetValues, UseFormWatch } from 'react-hook-form';

export function useAutoSave<T extends FieldValues>({
  isDirty,
  isValid,
  getValues,
  onSave,
  watch,
  trigger,
}: {
  isDirty: boolean;
  isValid: boolean;
  getValues: UseFormGetValues<T>;
  onSave: (data: T) => void;
  watch: UseFormWatch<T>;
  trigger: () => Promise<boolean>;
}) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const isDirtyRef = useRef(isDirty);
  const isValidRef = useRef(isValid);
  isDirtyRef.current = isDirty;
  isValidRef.current = isValid;

  // Flag set by the watch subscription when a form value changes.
  // The effect below only saves when this flag is true, so
  // validation-only re-renders (e.g. from trigger()) don't cause saves.
  const pendingSaveRef = useRef(false);

  useEffect(() => {
    const subscription = watch(() => {
      pendingSaveRef.current = true;
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- Autosave is intentionally triggered after react-hook-form publishes a watched change. */
  useEffect(() => {
    if (pendingSaveRef.current && isDirty) {
      pendingSaveRef.current = false;
      void trigger().then((valid) => {
        if (valid && isDirtyRef.current) {
          onSaveRef.current(getValues());
        }
      });
    }
  });
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

  // Save on unmount in case the deferred effect above hasn't fired yet
  // (React can unmount before a pending useEffect runs).
  //
  // Cleanup cannot await trigger(), so this is only a best-effort save of
  // the latest render's validated state. If a field change and its validation
  // result have not both committed by unmount time, this may save the previous
  // valid snapshot or drop the latest invalid draft. The save POST still parses
  // against the server-side assessment JSON schema before writing to disk, but
  // that schema does not enforce every client-side form invariant.
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && isValidRef.current) {
        onSaveRef.current(getValues());
      }
    };
  }, [getValues]);
}
