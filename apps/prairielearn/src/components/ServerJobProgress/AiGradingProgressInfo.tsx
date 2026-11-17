import { ServerJobsProgressInfo } from './ServerJobProgressBars.js';
import type { JobProgressWithStatus } from './useServerJobProgress.js';

const STATUS_ICONS = { inProgress: 'bi-stars' };

const STATUS_TEXT = {
  inProgress: 'AI grading in progress',
  stopping: 'Stopping AI grading…',
  stopped: 'AI grading stopped',
  complete: 'AI grading complete',
  failed: 'AI grading failed',
};

const STOP_CONFIRMATION = {
  title: 'Stop AI grading',
  body: 'In-progress submissions will finish. The rest will be skipped.',
  confirmLabel: 'Stop grading',
  cancelLabel: 'Keep grading',
};

export function AiGradingProgressInfo({
  jobsProgress,
  courseInstanceId,
  hasCourseInstancePermissionEdit,
  onDismissCompleteJobSequence,
  onStopJobSequence,
}: {
  jobsProgress: JobProgressWithStatus[];
  courseInstanceId: string;
  hasCourseInstancePermissionEdit: boolean;
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
  onStopJobSequence: (jobSequenceId: string) => void;
}) {
  if (hasCourseInstancePermissionEdit) {
    return (
      <ServerJobsProgressInfo
        itemNames="submissions graded"
        jobsProgress={jobsProgress}
        courseInstanceId={courseInstanceId}
        statusIcons={STATUS_ICONS}
        statusText={STATUS_TEXT}
        stopConfirmation={STOP_CONFIRMATION}
        stoppable
        onDismissCompleteJobSequence={onDismissCompleteJobSequence}
        onStopJobSequence={onStopJobSequence}
      />
    );
  }
  return (
    <ServerJobsProgressInfo
      itemNames="submissions graded"
      jobsProgress={jobsProgress}
      courseInstanceId={courseInstanceId}
      statusIcons={STATUS_ICONS}
      statusText={STATUS_TEXT}
      onDismissCompleteJobSequence={onDismissCompleteJobSequence}
    />
  );
}
