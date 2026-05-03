import type { ReactNode } from 'react';
import { Button, Card } from 'react-bootstrap';

export function FieldWrapper({
  isOverridden,
  label,
  onOverride,
  onRemoveOverride,
  headerToggle,
  headerAction,
  children,
}: {
  isOverridden: boolean;
  label: string;
  onOverride?: () => void;
  onRemoveOverride?: () => void;
  headerToggle?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
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
            <div className="d-flex justify-content-between align-items-center gap-3 mb-2 flex-wrap">
              {headerToggle ?? <strong>{label}</strong>}
              <div className="d-flex align-items-center gap-2 flex-shrink-0 ms-auto">
                {headerAction}
                {onRemoveOverride && (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    className="text-nowrap"
                    aria-label={`Remove override for ${label}`}
                    onClick={onRemoveOverride}
                  >
                    Remove override
                  </Button>
                )}
              </div>
            </div>
            {children}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
