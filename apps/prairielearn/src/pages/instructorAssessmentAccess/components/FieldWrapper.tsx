import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';

/**
 * Wrapper for override fields that shows an override/remove button
 * when not overridden.
 */
export function FieldWrapper({
  isOverridden,
  label,
  onOverride,
  onRemoveOverride,
  children,
  headerContent,
}: {
  /** Whether the field is currently overridden */
  isOverridden: boolean;
  /** Label shown when field is not overridden */
  label: string;
  /** Called when user clicks Override button */
  onOverride?: () => void;
  /** Called when user clicks Remove Override button */
  onRemoveOverride?: () => void;
  /** The field content to render when overridden */
  children: ReactNode;
  /** Optional: content to display in the header row next to the Remove override button */
  headerContent?: ReactNode;
}) {
  const cardStyle = isOverridden ? {} : { border: '2px dashed var(--bs-border-color)' };

  return (
    <Card style={cardStyle}>
      <Card.Body>
        {!isOverridden ? (
          <div className="d-flex justify-content-between align-items-center">
            <span className="text-muted">{label}</span>
            {onOverride && (
              <Button
                size="sm"
                variant="outline-primary"
                className="ms-3"
                aria-label={`Override ${label}`}
                onClick={onOverride}
              >
                Override
              </Button>
            )}
          </div>
        ) : (
          <>
            {(headerContent || onRemoveOverride) && (
              <div className="d-flex justify-content-between align-items-center mb-2">
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
