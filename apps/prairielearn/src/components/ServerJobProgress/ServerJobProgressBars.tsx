import { useMemo } from 'preact/compat';
import { Alert, ProgressBar } from 'react-bootstrap';

import type { JobProgress } from '../../lib/serverJobProgressSocket.shared.js';

/**
 * Displays progress information for multiple server jobs.
 *
 * This is used alongside the `useServerJobProgress` hook to display live progress information
 * for server jobs, retrieved via WebSocket connections.
 *
 * @param params
 *
 * @param params.itemNames What the name of the job items are (e.g. "submissions graded", "students invited").
 * @param params.jobsProgress Progress information for each server job.
 *
 * @param params.statusIcons Icons for indicating the server job status.
 * @param params.statusIcons.inProgress Icon for in-progress jobs.
 * @param params.statusIcons.complete Icon for completed jobs.
 * @param params.statusIcons.failed Icon for failed jobs.
 *
 * @param params.statusText Text describing the server job status.
 * @param params.statusText.inProgress Text for in-progress jobs.
 * @param params.statusText.complete Text for completed jobs.
 * @param params.statusText.failed Text for failed jobs.
 *
 * @param params.onDismissCompleteJobSequence Callback when the user dismisses a completed job progress alert. Used to remove the job from state.
 */
export function ServerJobsProgressInfo({
  statusIcons,
  statusText,
  itemNames,
  jobsProgress,
  onDismissCompleteJobSequence,
}: {
  itemNames: string;
  jobsProgress: JobProgress[];
  statusIcons: {
    inProgress?: string;
    complete?: string;
    failed?: string;
  };
  statusText: {
    inProgress?: string;
    complete?: string;
    failed?: string;
  };
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
  const statusIconsSafe = {
    inProgress: statusIcons.inProgress || 'bi-hourglass-split',
    complete: statusIcons.complete || 'bi-check-circle-fill',
    failed: statusIcons.failed || 'bi-x-circle-fill',
  };

  const statusTextSafe = {
    inProgress: statusText.inProgress || 'Job in progress',
    complete: statusText.complete || 'Job complete',
    failed: statusText.failed || 'Job failed',
  };

  return (
    <div class={`d-flex flex-column gap-3 ${jobsProgress.length > 0 ? 'mb-3' : ''}`}>
      {jobsProgress.map((jobProgress) => (
        <ServerJobProgressInfo
          key={`server-job-progress-bar-${jobProgress.job_sequence_id}`}
          jobSequenceId={jobProgress.job_sequence_id}
          nums={{
            complete: jobProgress.num_complete,
            failed: jobProgress.num_failed,
            total: jobProgress.num_total,
          }}
          statusIcons={statusIconsSafe}
          statusText={statusTextSafe}
          itemNames={itemNames}
          onDismissCompleteJobSequence={onDismissCompleteJobSequence}
        />
      ))}
    </div>
  );
}

/**
 * Displays progress information for a single server job.
 *
 * @param params
 * @param params.jobSequenceId The server job sequence ID to display progress info for.
 * @param params.itemNames What the name of the job items are (e.g. "submissions graded", "students invited").
 *
 * @param params.nums
 * @param params.nums.complete Number of job items completed (including failed items).
 * @param params.nums.failed Number of job items that failed.
 * @param params.nums.total Total number of items.
 *
 * @param params.statusIcons Icon indicating the server job status.
 * @param params.statusIcons.inProgress Icon for in-progress jobs.
 * @param params.statusIcons.complete Icon for completed jobs.
 * @param params.statusIcons.failed Icon for failed jobs.
 *
 * @param params.statusText Text describing the server job status.
 * @param params.statusText.inProgress Text for in-progress jobs.
 * @param params.statusText.complete Text for completed jobs.
 * @param params.statusText.failed Text for failed jobs.
 *
 * @param params.onDismissCompleteJobSequence Callback when the user dismisses a completed job progress alert. Used to remove the job from state.
 */
function ServerJobProgressInfo({
  jobSequenceId,
  nums,
  statusIcons,
  statusText,
  itemNames,
  onDismissCompleteJobSequence,
}: {
  jobSequenceId: string;
  itemNames: string;
  nums: {
    complete: number;
    failed: number;
    total: number;
  };
  statusIcons: {
    inProgress: string;
    complete: string;
    failed: string;
  };
  statusText: {
    inProgress: string;
    complete: string;
    failed: string;
  };
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
  const jobStatus = useMemo(() => {
    if (nums.complete >= nums.total) {
      return nums.failed > 0 ? 'failed' : 'complete';
    }
    return 'inProgress';
  }, [nums]);

  const { text, icon, variant } = useMemo(() => {
    if (jobStatus === 'complete') {
      return {
        text: statusText.complete,
        icon: statusIcons.complete,
        variant: 'success',
      };
    }
    if (jobStatus === 'failed') {
      return {
        text: statusText.failed,
        icon: statusIcons.failed,
        variant: 'danger',
      };
    }
    return {
      text: statusText.inProgress,
      icon: statusIcons.inProgress,
      variant: 'info',
    };
  }, [statusText, statusIcons, jobStatus]);

  return (
    <Alert
      variant={variant}
      class="mb-0"
      dismissible={jobStatus === 'complete' || jobStatus === 'failed'}
      onClose={() => onDismissCompleteJobSequence(jobSequenceId)}
    >
      <div class="d-flex flex-column flex-md-row align-items-md-center gap-2 gap-md-3">
        <div class="d-flex align-items-center gap-2">
          <i class={`bi ${icon} fs-5`} aria-hidden="true" />
          <strong>{text}</strong>
        </div>
        {jobStatus === 'inProgress' ? (
          <>
            <div class="flex-grow-1">
              <ProgressBar
                now={(nums.complete / nums.total) * 100}
                variant="primary"
                striped
                animated
              />
            </div>
            <div class="text-muted small">
              {`${nums.complete}/${nums.total} ${itemNames}`}
              <span class="text-danger">{nums.failed > 0 ? ` (${nums.failed} failed)` : ''}</span>
            </div>
          </>
        ) : (
          <div class="text-muted small">
            {jobStatus === 'failed'
              ? `${nums.total - nums.failed}/${nums.total} ${itemNames} (${nums.failed} failed)`
              : `${nums.total} ${itemNames}`}
          </div>
        )}
      </div>
    </Alert>
  );
}
