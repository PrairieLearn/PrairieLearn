import { Button } from 'react-bootstrap';

import { ChipGroup, type ChipItem } from '@prairielearn/ui';

export type { ChipItem };

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
      <ChipGroup
        items={items}
        label={addButtonLabel}
        emptyMessage={emptyMessage}
        onRemove={onRemove}
      />

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
