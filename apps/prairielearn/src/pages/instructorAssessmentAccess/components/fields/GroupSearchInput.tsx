import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Form, ListGroup, Spinner } from 'react-bootstrap';

import type { GroupTarget } from '../types.js';

interface GroupSearchInputProps {
  urlPrefix: string;
  assessmentId: string;
  excludedGroupIds: Set<string>;
  onSelect: (groups: GroupTarget[]) => void;
  onClose: () => void;
}

interface GroupData {
  id: string;
  name: string;
  color: string | null;
}

export function GroupSearchInput({
  urlPrefix,
  assessmentId,
  excludedGroupIds,
  onSelect,
  onClose,
}: GroupSearchInputProps) {
  const [filter, setFilter] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set());

  const { data: groups, isLoading } = useQuery({
    queryKey: ['access-control-groups', urlPrefix, assessmentId],
    queryFn: async () => {
      const res = await fetch(`${urlPrefix}/assessment/${assessmentId}/access/groups.json`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch groups');
      }
      return res.json() as Promise<GroupData[]>;
    },
  });

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    return groups.filter((group) => {
      if (excludedGroupIds.has(group.id)) return false;
      if (!filter) return true;
      return group.name.toLowerCase().includes(filter.toLowerCase());
    });
  }, [groups, excludedGroupIds, filter]);

  // Handle checkbox toggle
  const handleToggleGroup = (groupId: string) => {
    setSelectedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // Handle select all visible
  const handleSelectAll = () => {
    setSelectedGroups((prev) => {
      const newSet = new Set(prev);
      for (const group of filteredGroups) {
        newSet.add(group.id);
      }
      return newSet;
    });
  };

  // Handle clear selection
  const handleClearSelection = () => {
    setSelectedGroups(new Set());
  };

  // Handle adding selected groups
  const handleAddSelected = () => {
    if (!groups) return;
    const groupsToAdd = groups
      .filter((g) => selectedGroups.has(g.id) && !excludedGroupIds.has(g.id))
      .map((g) => ({
        groupId: g.id,
        name: g.name,
      }));
    if (groupsToAdd.length > 0) {
      onSelect(groupsToAdd);
      setSelectedGroups(new Set());
      onClose();
    }
  };

  const selectedCount = Array.from(selectedGroups).filter((id) => !excludedGroupIds.has(id)).length;

  return (
    <div style={{ minWidth: '250px' }}>
      <Form.Control
        className="mb-2"
        placeholder="Filter groups..."
        type="text"
        value={filter}
        onChange={(e) => setFilter((e.target as HTMLInputElement).value)}
      />

      {isLoading ? (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-muted text-center py-2">
          {groups?.length === 0 ? 'No groups available' : 'No matching groups'}
        </div>
      ) : (
        <>
          <div className="d-flex gap-2 mb-2">
            <Button variant="outline-secondary" size="sm" onClick={handleSelectAll}>
              Select all
            </Button>
            {selectedCount > 0 && (
              <>
                <Button variant="outline-secondary" size="sm" onClick={handleClearSelection}>
                  Clear
                </Button>
                <Button variant="primary" size="sm" onClick={handleAddSelected}>
                  Add {selectedCount} group{selectedCount !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </div>
          <ListGroup style={{ maxHeight: '200px', overflow: 'auto' }}>
            {filteredGroups.map((group) => (
              <ListGroup.Item
                key={group.id}
                className="py-2 d-flex align-items-center"
                action
                onClick={() => handleToggleGroup(group.id)}
              >
                <Form.Check
                  className="me-2"
                  type="checkbox"
                  checked={selectedGroups.has(group.id)}
                  onChange={() => {}}
                />
                <div className="d-flex align-items-center flex-grow-1">
                  {group.color && (
                    <span
                      className="d-inline-block rounded-circle me-2 flex-shrink-0"
                      style={{ width: '12px', height: '12px', backgroundColor: group.color }}
                    />
                  )}
                  <span>{group.name}</span>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </>
      )}
    </div>
  );
}
