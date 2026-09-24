import type { AssessmentInstanceActionRow } from '../instructorAssessmentInstances.types.js';

import { AssessmentInstanceActions } from './AssessmentInstanceActions.js';
import { UploadDropdown } from './UploadDropdown.js';

interface InstanceSelectionToolbarProps {
  selectedRows: AssessmentInstanceActionRow[];
  allRows: AssessmentInstanceActionRow[];
  clearSelection: () => void;
  courseInstanceId: string;
  assessmentId: string;
  timezone: string;
  onActionSuccess: (result: { message: string; action: 'delete' | 'timeLimit' }) => void;
  groupWork: boolean;
  isDevMode: boolean;
}

export function InstanceSelectionToolbar(props: InstanceSelectionToolbarProps) {
  const {
    selectedRows,
    allRows,
    clearSelection,
    courseInstanceId,
    assessmentId,
    timezone,
    onActionSuccess,
    groupWork,
    isDevMode,
  } = props;
  const target =
    selectedRows.length > 0
      ? { kind: 'selected' as const, instances: selectedRows }
      : { kind: 'all' as const, instances: allRows };

  return (
    <div className="d-flex align-items-center gap-2">
      <AssessmentInstanceActions
        target={target}
        clearSelection={clearSelection}
        courseInstanceId={courseInstanceId}
        assessmentId={assessmentId}
        timezone={timezone}
        onActionSuccess={onActionSuccess}
      />
      <UploadDropdown
        courseInstanceId={courseInstanceId}
        assessmentId={assessmentId}
        groupWork={groupWork}
        isDevMode={isDevMode}
      />
    </div>
  );
}
