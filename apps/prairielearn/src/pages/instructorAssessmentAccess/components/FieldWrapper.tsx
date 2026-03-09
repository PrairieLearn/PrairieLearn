import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';

interface FieldWrapperProps {
  /** Whether the field is currently overridden */
  isOverridden: boolean;
  /** Label shown when field is not overridden */
  label: string;
  /** The inherited value to display when not overridden */
  inheritedValue?: ReactNode;
  /** Called when user clicks Override button */
  onOverride?: () => void;
  /** Called when user clicks Remove Override button */
  onRemoveOverride?: () => void;
  /** The field content to render when overridden */
  children: ReactNode;
  /** Optional: content to display in the header row next to the Remove override button */
  headerContent?: ReactNode;
}

/**
 * Wrapper for override fields that shows an override/remove button
 * and the inherited value when not overridden.
 */
export function FieldWrapper({
  isOverridden,
  label,
  inheritedValue,
  onOverride,
  onRemoveOverride,
  children,
  headerContent,
}: FieldWrapperProps) {
  const cardStyle = isOverridden ? {} : { border: '2px dashed #dee2e6' };

  return (
    <Card className="mb-3" style={cardStyle}>
      <Card.Body>
        {!isOverridden ? (
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <span className="text-muted">{label}</span>
              {inheritedValue != null && (
                <div className="mt-1">
                  <span className="text-muted">
                    <i className="bi bi-arrow-return-right me-1" aria-hidden="true" />
                    {inheritedValue}
                  </span>
                  <br />
                  <small className="text-muted">Default from main rule</small>
                </div>
              )}
            </div>
            {onOverride && (
              <Button size="sm" variant="outline-primary" className="ms-3" onClick={onOverride}>
                Override
              </Button>
            )}
          </div>
        ) : (
          <>
            {(headerContent || onRemoveOverride) && (
              <div className="d-flex justify-content-between align-items-start mb-2">
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
