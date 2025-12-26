import { useMemo } from 'preact/compat';
import { Alert, ProgressBar } from 'react-bootstrap';

import type { StatusMessageWithProgress } from '../../lib/serverJobProgressSocket.shared.js';

function ServerJobProgressBar({
  jobSequenceId,
  nums,
  statusIcons,
  statusText,
  itemNames,
  onDismissCompleteJobSequence,
}: {
  jobSequenceId: string;
  nums: {
    complete: number;
    failed: number;
    total: number;
  },
  statusIcons: {
    inProgress: string;
    complete: string;
    failed: string;
  },
  statusText: {
    inProgress: string;
    complete: string;
    failed: string;
  },
  /** What is being counted: e.g. submissions graded, students invited */
  itemNames: string;
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
  const jobStatus = useMemo(() => {
    if (nums.complete >= nums.total) {
      return nums.failed > 0 ? 'failed' : 'complete';
    }
    return 'inProgress';
  }, [nums]);

  const {
    text,
    icon,
    variant
  } = useMemo(() => {
    if (jobStatus === 'complete') {
      return {
        text: statusText.complete,
        icon: statusIcons.complete,
        variant: 'success'
      };
    }
    if (jobStatus === 'failed') {
      return {
        text: statusText.failed,
        icon: statusIcons.failed,
        variant: 'danger'
      };
    }
    return {
      text: statusText.inProgress,
      icon: statusIcons.inProgress,
      variant: 'info'
    };
  }, [statusText, statusIcons, jobStatus])

  return (
    <Alert
      variant={variant}
      class="mb-3"
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

/**
 * Displays progress bars for multiple server jobs.
 */
export function ServerJobProgressBars({
  statusIcons,
  statusText,
  itemNames,
  jobsProgress,
  onDismissCompleteJobSequence,
}: {
  statusIcons: {
    inProgress?: string;
    complete?: string;
    failed?: string;
  },
  statusText: {
    inProgress?: string;
    complete?: string;
    failed?: string;
  },
  itemNames: string;
  jobsProgress: StatusMessageWithProgress[];
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
    <div class="d-flex flex-column">
      {jobsProgress.map((jobProgress) => (
        <ServerJobProgressBar
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
