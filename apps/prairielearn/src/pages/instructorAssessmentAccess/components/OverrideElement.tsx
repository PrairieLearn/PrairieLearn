import { Button, Card } from 'react-bootstrap';

interface OverrideElementProps {
  isOverridden: boolean;
  label: string;
  onOverride?: () => void;
  onRemoveOverride?: () => void;
  children: React.ReactNode;
  showOverrideButton?: boolean;
}

export function OverrideElement({
  isOverridden,
  label,
  onOverride,
  onRemoveOverride,
  children,
  showOverrideButton = true,
}: OverrideElementProps) {
  const getCardStyle = () => {
    return isOverridden ? {} : { border: '2px dashed #dee2e6', borderColor: '#dee2e6' };
  };

  return (
    <Card class="mb-3" style={getCardStyle()}>
      <Card.Body class="d-flex justify-content-between align-items-center">
        {!isOverridden ? (
          <span class="text-muted">{label}</span>
        ) : (
          <div style={{ flex: 1 }}>{children}</div>
        )}
        {showOverrideButton && (
          <>
            {!isOverridden && onOverride && (
              <Button size="sm" variant="outline-primary" class="ms-3" onClick={onOverride}>
                Override
              </Button>
            )}
            {isOverridden && onRemoveOverride && (
              <Button size="sm" variant="outline-danger" class="ms-3" onClick={onRemoveOverride}>
                Remove Override
              </Button>
            )}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
