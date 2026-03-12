import type { Key, ReactNode } from 'react';
import { Button, Tag, TagGroup, TagList } from 'react-aria-components';

export interface ChipItem {
  id: string;
  label: string;
}

export interface ChipGroupProps {
  /** Items to display as removable chips. */
  items: ChipItem[];
  /** Called when a chip is removed. Receives the item's `id`. */
  onRemove: (id: string) => void;
  /** Accessible label for the group (not visually rendered). */
  label: string;
  /** Message shown when there are no items. */
  emptyMessage?: string;
  /** Custom render function for chip content. Defaults to the item's label. */
  renderChip?: (item: ChipItem) => ReactNode;
}

export function ChipGroup({ items, onRemove, label, emptyMessage, renderChip }: ChipGroupProps) {
  const handleRemove = (keys: Set<Key>) => {
    for (const key of keys) {
      if (typeof key === 'string') {
        onRemove(key);
      }
    }
  };

  if (items.length === 0) {
    if (emptyMessage) {
      return <span className="text-muted small">{emptyMessage}</span>;
    }
    return null;
  }

  return (
    <TagGroup aria-label={label} onRemove={handleRemove}>
      <TagList className="d-inline-flex flex-wrap gap-1">
        {items.map((item) => (
          <Tag
            key={item.id}
            id={item.id}
            className="badge bg-secondary d-inline-flex align-items-center py-1 px-2"
            textValue={item.label}
          >
            <span className="me-1">{renderChip ? renderChip(item) : item.label}</span>
            <Button
              aria-label={`Remove ${item.label}`}
              className="btn-close p-0 border-0 bg-transparent"
              slot="remove"
              style={{ fontSize: '0.5rem', filter: 'invert(1)' }}
            />
          </Tag>
        ))}
      </TagList>
    </TagGroup>
  );
}
