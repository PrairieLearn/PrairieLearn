import { useState } from 'react';
import { Button } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import type { GroupTarget, IndividualTarget, TargetType } from '../types.js';

import { GroupSearchInput } from './GroupSearchInput.js';
import { StudentSearchInput } from './StudentSearchInput.js';

interface AddTargetPopoverProps {
  targetType: TargetType;
  urlPrefix: string;
  assessmentId: string;
  excludedGroupIds: Set<string>;
  excludedUids: Set<string>;
  onSelectGroups: (groups: GroupTarget[]) => void;
  onSelectStudents: (students: IndividualTarget[]) => void;
}

export function AddTargetPopover({
  targetType,
  urlPrefix,
  assessmentId,
  excludedGroupIds,
  excludedUids,
  onSelectGroups,
  onSelectStudents,
}: AddTargetPopoverProps) {
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);

  const popoverContent =
    targetType === 'group' ? (
      <GroupSearchInput
        urlPrefix={urlPrefix}
        assessmentId={assessmentId}
        excludedGroupIds={excludedGroupIds}
        onSelect={onSelectGroups}
        onClose={handleClose}
      />
    ) : (
      <StudentSearchInput
        urlPrefix={urlPrefix}
        assessmentId={assessmentId}
        excludedUids={excludedUids}
        onSelect={onSelectStudents}
        onClose={handleClose}
      />
    );

  const buttonLabel = targetType === 'group' ? 'Add groups' : 'Add students';
  const popoverHeader = targetType === 'group' ? 'Select groups' : 'Add students';

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
