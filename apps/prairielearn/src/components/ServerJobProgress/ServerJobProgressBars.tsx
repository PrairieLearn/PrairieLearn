import { useMemo } from 'react';
import { Alert, ProgressBar } from 'react-bootstrap';

import { formatMilliDollars } from '../../lib/ai-grading-credits.js';
import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';
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
 * @param params.courseInstanceId The course instance ID of the server jobs.
 *
 * @param params.statusIcons Icons for indicating the server job status.
 * @param params.statusIcons.inProgress Icon for in-progress jobs.
 * @param params.statusIcons.complete Icon for completed jobs.
 * @param params.statusIcons.failed Icon for failed jobs.
 *
 * @param params.statusText Text describing the server job status.
 * @param params.statusText.inProgress Text for in-progress jobs.
 * @param params.statusText.complete Text for completed jobs.
 * @param params.statusText.failed Default text for failed jobs. If a job has a specific failure message, it will be displayed instead.
 *
 * @param params.onDismissCompleteJobSequence Callback when the user dismisses a completed job progress alert. Used to remove the job from state.
 */
export function ServerJobsProgressInfo({
  itemNames,
  jobsProgress,
  courseInstanceId,
  statusIcons = {},
  statusText = {},
  onDismissCompleteJobSequence,
}: {
  itemNames: string;
  jobsProgress: JobProgress[];
  courseInstanceId: string;
  statusIcons?: {
    inProgress?: string;
    complete?: string;
    failed?: string;
  };
  statusText?: {
    inProgress?: string;
    complete?: string;
    failed?: string;
  };
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
  const statusIconsSafe = {
    inProgress: statusIcons.inProgress ?? 'bi-hourglass-split',
    complete: statusIcons.complete ?? 'bi-check-circle-fill',
    failed: statusIcons.failed ?? 'bi-exclamation-triangle-fill',
  };

  const statusTextSafe = {
    inProgress: statusText.inProgress ?? 'Job in progress',
    complete: statusText.complete ?? 'Job complete',
    failed: statusText.failed ?? 'Job failed',
  };

  return (
    <div className={`d-flex flex-column gap-3 ${jobsProgress.length > 0 ? 'mb-3' : ''}`}>
      {jobsProgress.map((jobProgress) => (
        <ServerJobProgressInfo
          key={`server-job-progress-bar-${jobProgress.job_sequence_id}`}
          jobSequenceId={jobProgress.job_sequence_id}
          courseInstanceId={courseInstanceId}
          nums={{
            complete: jobProgress.num_complete,
            failed: jobProgress.num_failed,
            total: jobProgress.num_total,
          }}
          statusIcons={statusIconsSafe}
          statusText={{
            ...statusTextSafe,
            failed: jobProgress.job_failure_message ?? statusTextSafe.failed,
          }}
          itemNames={itemNames}
          totalCostMilliDollars={jobProgress.total_cost_milli_dollars}
          numItemsIncurredCost={jobProgress.num_items_incurred_cost}
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
 * @param params.courseInstanceId The course instance ID of the server job to display.
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
 * @param params.totalCostMilliDollars Optional running total cost in milli-dollars for the job.
 * @param params.numItemsIncurredCost Optional number of items that incurred cost.
 *
 * @param params.onDismissCompleteJobSequence Callback when the user dismisses a completed job progress alert. Used to remove the job from state.
 */
function ServerJobProgressInfo({
  jobSequenceId,
  courseInstanceId,
  itemNames,
  nums,
  statusIcons,
  statusText,
  totalCostMilliDollars,
  numItemsIncurredCost,
  onDismissCompleteJobSequence,
}: {
  jobSequenceId: string;
  courseInstanceId: string;
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
  totalCostMilliDollars?: number;
  numItemsIncurredCost?: number;
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
  const jobStatus = useMemo(() => {
    if (nums.total > 0 && nums.complete >= nums.total) {
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

  const progressPercent = nums.total !== 0 ? (nums.complete / nums.total) * 100 : 0;
  const successCount = nums.complete - nums.failed;

  const perSubmissionLabel = useMemo(() => {
    if (
      totalCostMilliDollars == null ||
      numItemsIncurredCost == null ||
      numItemsIncurredCost <= 0
    ) {
      return null;
    }
    const avg = formatMilliDollars(Math.round(totalCostMilliDollars / numItemsIncurredCost));
    return `${avg.startsWith('<') ? avg : `~${avg}`}/submission`;
  }, [totalCostMilliDollars, numItemsIncurredCost]);

  const progressLabel = useMemo(() => {
    switch (jobStatus) {
      case 'inProgress': {
        const failedSuffix = nums.failed > 0 ? ` (${nums.failed} failed)` : '';
        return `${nums.complete}/${nums.total} ${itemNames}${failedSuffix}`;
      }
      case 'failed':
        return `${successCount}/${nums.total} ${itemNames} (${nums.failed} failed)`;
      case 'complete':
        return `${nums.total} ${itemNames}`;
    }
  }, [jobStatus, nums, itemNames, successCount]);

  return (
    <Alert
      variant={variant}
      className="mb-0"
      dismissible={jobStatus === 'complete' || jobStatus === 'failed'}
      onClose={() => onDismissCompleteJobSequence(jobSequenceId)}
    >
      <div className="d-flex flex-wrap align-items-center gap-2 gap-lg-3">
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          <i className={`bi ${icon} fs-5`} aria-hidden="true" />
          <strong>{text}</strong>
        </div>

        {jobStatus === 'inProgress' && (
          <div className="flex-grow-1" style={{ flexBasis: '6rem' }}>
            <ProgressBar>
              <ProgressBar
                key="success"
                now={progressPercent - (nums.total !== 0 ? (nums.failed / nums.total) * 100 : 0)}
                variant="primary"
                animated
              />
              {nums.failed > 0 && (
                <ProgressBar key="failed" now={(nums.failed / nums.total) * 100} variant="danger" />
              )}
            </ProgressBar>
          </div>
        )}

        <div className="d-flex flex-wrap align-items-center gap-2 small">
          <span className="text-body-secondary">{progressLabel}</span>

          {totalCostMilliDollars != null && (
            <>
              <span className="text-body-secondary opacity-50" aria-hidden="true">
                &middot;
              </span>
              {perSubmissionLabel && (
                <>
                  <span className="text-body-secondary">{perSubmissionLabel}</span>
                  <span className="text-body-secondary opacity-50" aria-hidden="true">
                    &middot;
                  </span>
                </>
              )}
              <span className="text-body-secondary fw-medium">
                Total: {formatMilliDollars(totalCostMilliDollars)}
              </span>
            </>
          )}

          <span className="text-body-secondary opacity-50" aria-hidden="true">
            &middot;
          </span>
          <a
            href={getCourseInstanceJobSequenceUrl(courseInstanceId, jobSequenceId)}
            className="text-decoration-none"
            target="_blank"
            rel="noreferrer"
            aria-label="View job logs"
          >
            View logs <i className="bi bi-box-arrow-up-right" style={{ fontSize: '0.7em' }} />
          </a>
        </div>
      </div>
    </Alert>
  );
}
