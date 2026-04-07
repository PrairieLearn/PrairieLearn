import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';

import { useTRPC } from '../../../../trpc/assessment/context.js';
import type { EnrollmentTarget } from '../types.js';

import { StudentSearchInput } from './StudentSearchInput.js';

export function AddStudentsModal({
  selectedUids: initialSelectedUids,
  onSaveStudents,
  renderTrigger,
}: {
  selectedUids: Set<string>;
  onSaveStudents: (students: EnrollmentTarget[]) => void;
  renderTrigger?: (props: { onClick: () => void }) => ReactNode;
}) {
  const trpc = useTRPC();
  const [show, setShow] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set(initialSelectedUids));

  const { data: allStudents, isLoading } = useQuery({
    ...trpc.accessControl.students.queryOptions(),
    enabled: show,
  });

  const handleOpen = () => {
    setSelectedUids(new Set(initialSelectedUids));
    setShow(true);
  };

  const handleClose = () => setShow(false);

  const handleSave = () => {
    if (!allStudents) return;
    const selected = allStudents
      .filter((s) => selectedUids.has(s.uid))
      .map((s) => ({ enrollmentId: s.id, uid: s.uid, name: s.name }));
    onSaveStudents(selected);
    handleClose();
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ onClick: handleOpen })
      ) : (
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleOpen}>
          <i className="bi bi-people me-1" aria-hidden="true" />
          Manage students
        </button>
      )}
      <Modal show={show} centered onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Select students</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isLoading ? (
            <div className="text-center py-3">
              <Spinner animation="border" size="sm" />
            </div>
          ) : !allStudents || allStudents.length === 0 ? (
            <div className="text-muted text-center py-2">No students enrolled</div>
          ) : (
            <StudentSearchInput
              allStudents={allStudents}
              selectedUids={selectedUids}
              onSelectedUidsChange={setSelectedUids}
            />
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={isLoading} onClick={handleSave}>
            Done{selectedUids.size > 0 ? ` (${selectedUids.size} selected)` : ''}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
