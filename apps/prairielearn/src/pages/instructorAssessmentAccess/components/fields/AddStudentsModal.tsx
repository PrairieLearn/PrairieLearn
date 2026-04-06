import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { EnrollmentTarget } from '../types.js';

import { StudentSearchInput } from './StudentSearchInput.js';

export function AddStudentsModal({
  excludedUids,
  onSelectStudents,
}: {
  excludedUids: Set<string>;
  onSelectStudents: (students: EnrollmentTarget[]) => void;
}) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);

  return (
    <>
      <Button variant="outline-secondary" size="sm" onClick={() => setShow(true)}>
        <i className="bi bi-plus me-1" aria-hidden="true" />
        Add students
      </Button>
      <Modal show={show} centered onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Add students</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <StudentSearchInput
            excludedUids={excludedUids}
            onSelect={onSelectStudents}
            onClose={handleClose}
          />
        </Modal.Body>
      </Modal>
    </>
  );
}
