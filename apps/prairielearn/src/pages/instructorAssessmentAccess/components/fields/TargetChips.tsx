import { Badge, Button, CloseButton } from 'react-bootstrap';

export interface ChipItem {
  id: string;
  label: string;
}

interface TargetChipsProps {
  items: ChipItem[];
  onRemove: (id: string) => void;
  onRemoveAll?: () => void;
  onAddClick: () => void;
  addButtonLabel: string;
  showRemoveAll?: boolean;
  emptyMessage?: string;
}

export function TargetChips({
  items,
  onRemove,
  onRemoveAll,
  onAddClick,
  addButtonLabel,
  showRemoveAll = false,
  emptyMessage = 'None selected',
}: TargetChipsProps) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-1">
      {items.length === 0 ? (
        <span className="text-muted small">{emptyMessage}</span>
      ) : (
        items.map((item) => (
          <Badge
            key={item.id}
            bg="secondary"
            className="d-inline-flex align-items-center py-1 px-2"
          >
            <span className="me-1">{item.label}</span>
            <CloseButton
              aria-label={`Remove ${item.label}`}
              style={{ fontSize: '0.5rem' }}
              variant="white"
              onClick={() => onRemove(item.id)}
            />
          </Badge>
        ))
      )}

      <Button variant="outline-primary" size="sm" onClick={onAddClick}>
        {addButtonLabel}
      </Button>

      {showRemoveAll && items.length > 0 && onRemoveAll && (
        <Button variant="outline-secondary" size="sm" onClick={onRemoveAll}>
          Remove all
        </Button>
      )}
    </div>
  );
}
