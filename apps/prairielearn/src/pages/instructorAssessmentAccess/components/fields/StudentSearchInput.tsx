import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';

import { StudentCheckboxList } from '../../../../components/StudentCheckboxList.js';
import { useTRPC } from '../../../../trpc/assessment/context.js';
import type { EnrollmentTarget } from '../types.js';

export function StudentSearchInput({
  initialSelectedUids,
  onSave,
  onClose,
}: {
  initialSelectedUids: Set<string>;
  onSave: (students: EnrollmentTarget[]) => void;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set(initialSelectedUids));

  const { data: allStudents, isLoading } = useQuery(trpc.accessControl.students.queryOptions());

  const filteredStudents = useMemo(() => {
    if (!allStudents) return [];
    if (!searchQuery) return allStudents;
    const query = searchQuery.toLowerCase();
    return allStudents.filter(
      (student) =>
        student.uid.toLowerCase().includes(query) ||
        (student.name?.toLowerCase().includes(query) ?? false),
    );
  }, [allStudents, searchQuery]);

  const handleToggleStudent = (uid: string) => {
    setSelectedUids((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uid)) newSet.delete(uid);
      else newSet.add(uid);
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedUids((prev) => {
      const newSet = new Set(prev);
      for (const student of filteredStudents) {
        newSet.add(student.uid);
      }
      return newSet;
    });
  };

  const handleClearAll = () => {
    setSelectedUids(new Set());
  };

  const handleSave = () => {
    if (!allStudents) return;
    const selected = allStudents
      .filter((s) => selectedUids.has(s.uid))
      .map((s) => ({ enrollmentId: s.id, uid: s.uid, name: s.name }));
    onSave(selected);
    onClose();
  };

  const selectedCount = selectedUids.size;

  if (isLoading) {
    return (
      <div className="text-center py-3">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (!allStudents || allStudents.length === 0) {
    return <div className="text-muted text-center py-2">No students enrolled</div>;
  }

  return (
    <div className="d-flex flex-column gap-2">
      <Form.Control
        aria-label="Filter students by name or UID"
        placeholder="Filter by name or UID..."
        type="text"
        value={searchQuery}
        onChange={({ currentTarget }) => setSearchQuery(currentTarget.value)}
      />

      {filteredStudents.length === 0 ? (
        <div className="text-muted text-center py-3 border rounded">No matching students</div>
      ) : (
        <StudentCheckboxList
          items={filteredStudents}
          selectedUids={selectedUids}
          label="Student selection"
          checkboxIdPrefix="student-select"
          maxHeight="300px"
          onToggle={handleToggleStudent}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleClearAll}
        />
      )}

      <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSave}>
          Done{selectedCount > 0 ? ` (${selectedCount} selected)` : ''}
        </Button>
      </div>
    </div>
  );
}
