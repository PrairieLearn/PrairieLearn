import type { ComponentChildren } from 'preact';
import { Button, Card } from 'react-bootstrap';

interface FieldWrapperProps {
  /** Whether this is an override rule (shows override/remove buttons) */
  isOverrideRule: boolean;
  /** Whether the field is currently overridden */
  isOverridden: boolean;
  /** Label shown when field is not overridden */
  label: string;
  /** Called when user clicks Override button */
  onOverride?: () => void;
  /** Called when user clicks Remove Override button */
  onRemoveOverride?: () => void;
  /** The field content to render when overridden (or always for main rule) */
  children: ComponentChildren;
  /** Optional: render as a simple container without card styling for main rule */
  noCardForMainRule?: boolean;
  /** Optional: content to display in the header row next to the Remove override button */
  headerContent?: ComponentChildren;
}

/**
 * Wrapper component that handles the conditional rendering between
 * main rule (always shows content) and override rule (shows override button or content).
 */
export function FieldWrapper({
  isOverrideRule,
  isOverridden,
  label,
  onOverride,
  onRemoveOverride,
  children,
  noCardForMainRule = false,
  headerContent,
}: FieldWrapperProps) {
  // For main rules, just render the children (optionally without card)
  if (!isOverrideRule) {
    if (noCardForMainRule) {
      return (
        <>
          {headerContent && <div class="mb-2">{headerContent}</div>}
          {children}
        </>
      );
    }
    return (
      <div class="mb-3">
        {headerContent && <div class="mb-2">{headerContent}</div>}
        {children}
      </div>
    );
  }

  // For override rules, show the override UI
  const cardStyle = isOverridden ? {} : { border: '2px dashed #dee2e6' };

  return (
    <Card class="mb-3" style={cardStyle}>
      <Card.Body>
        {!isOverridden ? (
          <div class="d-flex justify-content-between align-items-center">
            <span class="text-muted">{label}</span>
            {onOverride && (
              <Button size="sm" variant="outline-primary" class="ms-3" onClick={onOverride}>
                Override
              </Button>
            )}
          </div>
        ) : (
          <>
            {(headerContent || onRemoveOverride) && (
              <div class="d-flex justify-content-between align-items-start mb-2">
                {headerContent}
                {onRemoveOverride && (
                  <Button size="sm" variant="outline-danger" onClick={onRemoveOverride}>
                    Remove override
                  </Button>
                )}
              </div>
            )}
            <div>{children}</div>
          </>
        )}
      </Card.Body>
    </Card>
  );
}
