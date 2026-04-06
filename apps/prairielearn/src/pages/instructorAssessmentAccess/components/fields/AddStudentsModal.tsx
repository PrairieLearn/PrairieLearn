import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { EnrollmentTarget } from '../types.js';

import { StudentSearchInput } from './StudentSearchInput.js';

export function AddStudentsModal({
  selectedUids,
  onSaveStudents,
}: {
  selectedUids: Set<string>;
  onSaveStudents: (students: EnrollmentTarget[]) => void;
}) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);

  return (
    <>
      <Button variant="outline-secondary" size="sm" onClick={() => setShow(true)}>
        <i className="bi bi-people me-1" aria-hidden="true" />
        Manage students
      </Button>
      <Modal show={show} centered onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Manage students</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <StudentSearchInput
            initialSelectedUids={selectedUids}
            onSave={onSaveStudents}
            onClose={handleClose}
          />
        </Modal.Body>
      </Modal>
    </>
  );
}
