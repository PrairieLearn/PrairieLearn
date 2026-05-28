import { useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';

import { StudentCheckboxList } from '../../../../components/StudentCheckboxList.js';

interface Student {
  id: string;
  uid: string;
  name: string | null;
}

export function StudentSearchInput({
  allStudents,
  selectedUids,
  onSelectedUidsChange,
}: {
  allStudents: Student[];
  selectedUids: Set<string>;
  onSelectedUidsChange: (uids: Set<string>) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredStudents = useMemo(() => {
    if (!searchQuery) return allStudents;
    const query = searchQuery.toLowerCase();
    return allStudents.filter(
      (student) =>
        student.uid.toLowerCase().includes(query) ||
        (student.name?.toLowerCase().includes(query) ?? false),
    );
  }, [allStudents, searchQuery]);

  const handleToggleStudent = (uid: string) => {
    const newSet = new Set(selectedUids);
    if (newSet.has(uid)) newSet.delete(uid);
    else newSet.add(uid);
    onSelectedUidsChange(newSet);
  };

  const handleSelectAll = () => {
    const newSet = new Set(selectedUids);
    for (const student of filteredStudents) {
      newSet.add(student.uid);
    }
    onSelectedUidsChange(newSet);
  };

  const handleClearAll = () => {
    onSelectedUidsChange(new Set());
  };

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
    </div>
  );
}
