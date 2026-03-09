import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Form, ListGroup, Spinner } from 'react-bootstrap';

import { useTRPCClient } from '../../utils/trpc-context.js';
import type { StudentLabelTarget } from '../types.js';

interface StudentLabelSearchInputProps {
  excludedStudentLabelIds: Set<string>;
  onSelect: (studentLabels: StudentLabelTarget[]) => void;
  onClose: () => void;
}

export function StudentLabelSearchInput({
  excludedStudentLabelIds,
  onSelect,
  onClose,
}: StudentLabelSearchInputProps) {
  const trpcClient = useTRPCClient();
  const [filter, setFilter] = useState('');
  const [selectedStudentLabels, setSelectedStudentLabels] = useState<Set<string>>(() => new Set());

  const { data: studentLabels, isLoading } = useQuery({
    queryKey: ['access-control-student-labels'],
    queryFn: () => trpcClient.studentLabels.query(),
  });

  const filteredStudentLabels = useMemo(() => {
    if (!studentLabels) return [];
    return studentLabels.filter((studentLabel) => {
      if (excludedStudentLabelIds.has(studentLabel.id)) return false;
      if (!filter) return true;
      return studentLabel.name.toLowerCase().includes(filter.toLowerCase());
    });
  }, [studentLabels, excludedStudentLabelIds, filter]);

  const handleToggleStudentLabel = (studentLabelId: string) => {
    setSelectedStudentLabels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(studentLabelId)) {
        newSet.delete(studentLabelId);
      } else {
        newSet.add(studentLabelId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedStudentLabels((prev) => {
      const newSet = new Set(prev);
      for (const studentLabel of filteredStudentLabels) {
        newSet.add(studentLabel.id);
      }
      return newSet;
    });
  };

  const handleClearSelection = () => {
    setSelectedStudentLabels(new Set());
  };

  const handleAddSelected = () => {
    if (!studentLabels) return;
    const labelsToAdd = studentLabels
      .filter(
        (label) => selectedStudentLabels.has(label.id) && !excludedStudentLabelIds.has(label.id),
      )
      .map((label) => ({
        studentLabelId: label.id,
        name: label.name,
      }));
    if (labelsToAdd.length > 0) {
      onSelect(labelsToAdd);
      setSelectedStudentLabels(new Set());
      onClose();
    }
  };

  const selectedCount = Array.from(selectedStudentLabels).filter(
    (id) => !excludedStudentLabelIds.has(id),
  ).length;

  return (
    <div style={{ minWidth: '250px' }}>
      <Form.Control
        className="mb-2"
        aria-label="Filter student labels"
        placeholder="Filter student labels..."
        type="text"
        value={filter}
        onChange={({ currentTarget }) => setFilter(currentTarget.value)}
      />

      {isLoading ? (
        <div className="text-center py-3">
          <Spinner animation="border" size="sm" />
        </div>
      ) : filteredStudentLabels.length === 0 ? (
        <div className="text-muted text-center py-2">
          {studentLabels?.length === 0
            ? 'No student labels available'
            : 'No matching student labels'}
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
                  Add {selectedCount} student label{selectedCount !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </div>
          <ListGroup style={{ maxHeight: '200px', overflow: 'auto' }}>
            {filteredStudentLabels.map((studentLabel) => (
              <ListGroup.Item
                key={studentLabel.id}
                className="py-2 d-flex align-items-center"
                aria-selected={selectedStudentLabels.has(studentLabel.id)}
                action
                onClick={() => handleToggleStudentLabel(studentLabel.id)}
              >
                <Form.Check
                  className="me-2"
                  type="checkbox"
                  checked={selectedStudentLabels.has(studentLabel.id)}
                  tabIndex={-1}
                  aria-hidden="true"
                  readOnly
                />
                <div className="d-flex align-items-center flex-grow-1">
                  {studentLabel.color && (
                    <span
                      className="d-inline-block rounded-circle me-2 flex-shrink-0"
                      style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: studentLabel.color,
                      }}
                    />
                  )}
                  <span>{studentLabel.name}</span>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </>
      )}
    </div>
  );
}
