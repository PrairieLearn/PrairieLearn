import { type ReactNode, createContext, use, useId } from 'react';
import Form from 'react-bootstrap/Form';

interface RadioGroupContextValue {
  name: string;
  value: string;
  onChange: (value: string) => void;
}

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps<T extends string = string> {
  name?: string;
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}

export function RadioGroup<T extends string = string>({
  name,
  value,
  onChange,
  children,
}: RadioGroupProps<T>) {
  const autoId = useId();
  return (
    <RadioGroupContext
      value={{ name: name ?? autoId, value, onChange: onChange as (v: string) => void }}
    >
      {children}
    </RadioGroupContext>
  );
}

export interface RadioProps {
  value: string;
  children: ReactNode;
}

export function Radio({ value, children }: RadioProps) {
  const context = use(RadioGroupContext);
  if (!context) {
    throw new Error('Radio must be used within a RadioGroup');
  }
  const id = useId();
  return (
    <Form.Check
      type="radio"
      id={id}
      name={context.name}
      label={children}
      checked={context.value === value}
      onChange={() => context.onChange(value)}
    />
  );
}
