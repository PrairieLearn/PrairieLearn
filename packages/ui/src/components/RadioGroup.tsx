import type { ReactNode } from 'react';
import {
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
} from 'react-aria-components';

export interface RadioGroupProps<T extends string = string> extends Omit<
  AriaRadioGroupProps,
  'value' | 'onChange'
> {
  value: T;
  onChange: (value: T) => void;
}

export function RadioGroup<T extends string = string>({ onChange, ...props }: RadioGroupProps<T>) {
  return <AriaRadioGroup {...props} onChange={(v) => onChange(v as T)} />;
}

export interface RadioProps extends Omit<AriaRadioProps, 'className' | 'children'> {
  children: ReactNode;
}

export function Radio({ children, ...props }: RadioProps) {
  return (
    <AriaRadio {...props} className="form-check">
      <span className="pl-ui-radio-indicator" aria-hidden="true" />
      <span className="form-check-label ms-2">{children}</span>
    </AriaRadio>
  );
}
