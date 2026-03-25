import { useState } from 'react';
import { Button } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import type { IndividualTarget, StudentLabelTarget, TargetType } from '../types.js';

import { StudentLabelSearchInput } from './StudentLabelSearchInput.js';
import { StudentSearchInput } from './StudentSearchInput.js';

interface AddTargetPopoverProps {
  targetType: TargetType;
  excludedStudentLabelIds: Set<string>;
  excludedUids: Set<string>;
  onSelectStudentLabels: (studentLabels: StudentLabelTarget[]) => void;
  onSelectStudents: (students: IndividualTarget[]) => void;
}

export function AddTargetPopover({
  targetType,
  excludedStudentLabelIds,
  excludedUids,
  onSelectStudentLabels,
  onSelectStudents,
}: AddTargetPopoverProps) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);

  const popoverContent =
    targetType === 'student_label' ? (
      <StudentLabelSearchInput
        excludedStudentLabelIds={excludedStudentLabelIds}
        onSelect={onSelectStudentLabels}
        onClose={handleClose}
      />
    ) : (
      <StudentSearchInput
        excludedUids={excludedUids}
        onSelect={onSelectStudents}
        onClose={handleClose}
      />
    );

  const buttonLabel = targetType === 'student_label' ? 'Add student labels' : 'Add students';
  const popoverHeader = targetType === 'student_label' ? 'Select student labels' : 'Add students';

  return (
    <OverlayTrigger
      placement="bottom-start"
      popover={{
        props: { style: { maxWidth: 'none' } },
        header: popoverHeader,
        body: popoverContent,
      }}
      show={show}
      trigger="click"
      rootClose
      onToggle={setShow}
    >
      <Button variant="outline-primary" size="sm">
        {buttonLabel}
      </Button>
    </OverlayTrigger>
  );
}
