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

  // Save after each render where a form value changed and the form is
  // dirty. We explicitly trigger() validation rather than relying on
  // isValid from the render scope, because a watch-triggered re-render
  // can have stale isValid (true) before validation has completed.
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

  // Save on unmount in case the deferred effect above hasn't fired yet
  // (React can unmount before a pending useEffect runs).
  //
  // Note: isValidRef can theoretically be stale here (the main save path
  // uses trigger() for fresh validation, but trigger() is async and can't
  // be awaited in a cleanup function). In practice this is fine because all
  // form validators in the editor are synchronous, so isValid settles
  // before the next render. The reducer state is also validated server-side
  // before being written to disk, so a stale validity check here is low-risk.
  useEffect(() => {
    return () => {
      if (isDirtyRef.current && isValidRef.current) {
        onSaveRef.current(getValues());
      }
    };
  }, [getValues]);
}
