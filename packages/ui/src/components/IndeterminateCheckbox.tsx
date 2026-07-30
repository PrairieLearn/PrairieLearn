import { type InputHTMLAttributes, useEffect, useRef } from 'react';

export interface IndeterminateCheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  indeterminate: boolean;
}

export function IndeterminateCheckbox({ indeterminate, ...props }: IndeterminateCheckboxProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return <input ref={checkboxRef} type="checkbox" {...props} />;
}
