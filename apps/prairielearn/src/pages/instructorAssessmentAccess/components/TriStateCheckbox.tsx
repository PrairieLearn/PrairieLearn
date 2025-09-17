import { Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { type Control, useController } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface TriStateCheckboxProps {
  control: Control<AccessControlFormData>;
  /** The form field path */
  name: any;
  disabled?: boolean;
  /** Tooltip text to show when disabled */
  disabledReason?: string;
  class?: string;
}

export function TriStateCheckbox({
  control,
  name,
  disabled = false,
  disabledReason,
  class: className = '',
}: TriStateCheckboxProps) {
  const {
    field: { value, onChange },
  } = useController({
    control,
    name,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange((e.target as HTMLInputElement)?.checked);
    }
  };

  const checkbox = (
    <Form.Check
      type="checkbox"
      checked={Boolean(value)}
      class={className}
      disabled={disabled}
      onChange={handleChange}
    />
  );

  // Wrap with tooltip if disabled with reason
  if (disabled && disabledReason) {
    return (
      <OverlayTrigger placement="top" overlay={<Tooltip>{disabledReason}</Tooltip>}>
        <span>{checkbox}</span>
      </OverlayTrigger>
    );
  }

  return checkbox;
}
