import { AssessmentInstanceActions } from '../../../components/AssessmentInstanceActions/AssessmentInstanceActions.js';
import { getAssessmentLogsUrl } from '../../../lib/client/url.js';
import type { AssessmentInstanceRow } from '../instructorAssessmentInstances.types.js';

import { UploadDropdown } from './UploadDropdown.js';

export function InstanceSelectionToolbar({
  selectedRows,
  allRows,
  clearSelection,
  courseInstanceId,
  assessmentId,
  timezone,
  groupWork,
  isDevMode,
  onActionSuccess,
}: {
  selectedRows: AssessmentInstanceRow[];
  allRows: AssessmentInstanceRow[];
  clearSelection: () => void;
  courseInstanceId: string;
  assessmentId: string;
  timezone: string;
  groupWork: boolean;
  isDevMode: boolean;
  onActionSuccess: (message: string) => void;
}) {
  function handleSuccess(message: string) {
    onActionSuccess(message);
    clearSelection();
  }

  return (
    <div className="d-flex align-items-center gap-2">
      <AssessmentInstanceActions
        target={
          selectedRows.length === 0
            ? { type: 'all', instances: allRows }
            : { type: 'selected', instances: selectedRows }
        }
        courseInstanceId={courseInstanceId}
        timezone={timezone}
        logsUrl={getAssessmentLogsUrl({ courseInstanceId, assessmentId })}
        onDeleteSuccess={handleSuccess}
        onTimeLimitSuccess={handleSuccess}
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
