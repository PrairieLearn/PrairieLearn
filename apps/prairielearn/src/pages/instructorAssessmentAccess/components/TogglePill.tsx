import { Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { type Control, useController } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';

interface TogglePillProps {
  control: Control<AccessControlFormData>;
  /** We'll use a generic type since the paths can be complex */
  name: any;
  disabled?: boolean;
  /** Tooltip text to show when disabled */
  disabledReason?: string;
  class?: string;
}

export function TogglePill({
  control,
  name,
  disabled = false,
  disabledReason,
  class: className = '',
}: TogglePillProps) {
  const {
    field: { value, onChange },
  } = useController({
    control,
    name,
  });

  const handleClick = () => {
    if (!disabled) {
      onChange(!value);
    }
  };

  const isEnabled = Boolean(value);

  // Determine badge color and content based on state
  const getBadgeColor = () => {
    if (disabled) return 'secondary'; // Gray when disabled
    return isEnabled ? 'success' : 'danger';
  };

  const getBadgeContent = () => {
    if (disabled && disabledReason) {
      return (
        <>
          {isEnabled ? 'Enabled' : 'Disabled'}
          <span class="ms-1">❓</span>
        </>
      );
    }
    return isEnabled ? 'Enabled' : 'Disabled';
  };

  const badge = (
    <Badge
      bg={getBadgeColor()}
      class={`user-select-none ${disabled ? '' : 'cursor-pointer'} ${className}`}
      style={{
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '0.75rem',
        padding: '0.25rem 0.5rem',
      }}
      onClick={handleClick}
    >
      {getBadgeContent()}
    </Badge>
  );

  // Wrap with tooltip if disabled with reason
  if (disabled && disabledReason) {
    return (
      <OverlayTrigger placement="top" overlay={<Tooltip>{disabledReason}</Tooltip>}>
        <span>{badge}</span>
      </OverlayTrigger>
    );
  }

  return badge;
}
