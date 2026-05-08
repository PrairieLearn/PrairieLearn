import { useMemo, useState } from 'react';
import { Alert, Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';

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
 *
 * @param params.onStopJobSequence Optional callback that, when provided, renders a Stop button on running jobs.
 * @param params.isStopPending Optional predicate returning true while a stop request is in flight; the Stop button is hidden during that interval.
 */
export function ServerJobsProgressInfo({
  itemNames,
  jobsProgress,
  courseInstanceId,
  statusIcons = {},
  statusText = {},
  onDismissCompleteJobSequence,
  onStopJobSequence,
  isStopPending,
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
  onStopJobSequence?: (jobSequenceId: string) => void;
  isStopPending?: (jobSequenceId: string) => boolean;
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
          isStopping={jobProgress.is_stopping ?? false}
          isStopped={jobProgress.is_stopped ?? false}
          isStopPending={isStopPending?.(jobProgress.job_sequence_id) ?? false}
          onDismissCompleteJobSequence={onDismissCompleteJobSequence}
          onStopJobSequence={onStopJobSequence}
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
 * @param params.isStopping Cancellation requested but not yet settled.
 * @param params.isStopped Terminal: cancellation has fully settled.
 *
 * @param params.onDismissCompleteJobSequence Callback when the user dismisses a completed job progress alert.
 * @param params.onStopJobSequence Optional callback that, when provided, renders a Stop button.
 * @param params.isStopPending True while a stop request is in flight; the Stop button is hidden during that interval.
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
  isStopping,
  isStopped,
  onDismissCompleteJobSequence,
  onStopJobSequence,
  isStopPending,
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
  isStopping: boolean;
  isStopped: boolean;
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
  onStopJobSequence?: (jobSequenceId: string) => void;
  isStopPending: boolean;
}) {
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const jobStatus = useMemo(() => {
    if (isStopped) return 'stopped';
    if (nums.total > 0 && nums.complete >= nums.total) {
      return nums.failed > 0 ? 'failed' : 'complete';
    }
    if (isStopping) return 'stopping';
    return 'inProgress';
  }, [nums, isStopping, isStopped]);

  const { text, subtext, icon, variant } = useMemo<{
    text: string;
    subtext: string | undefined;
    icon: string;
    variant: string;
  }>(() => {
    const display = {
      stopped: { text: 'AI grading stopped', icon: 'bi-stop-circle-fill', variant: 'secondary' },
      stopping: { text: 'Stopping AI grading…', icon: 'bi-stop-circle-fill', variant: 'secondary' },
      complete: { text: statusText.complete, icon: statusIcons.complete, variant: 'success' },
      failed: { text: statusText.failed, icon: statusIcons.failed, variant: 'danger' },
      inProgress: { text: statusText.inProgress, icon: statusIcons.inProgress, variant: 'info' },
    } as const;
    return { ...display[jobStatus], subtext: undefined };
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
      case 'inProgress':
      case 'stopping': {
        const failedSuffix = nums.failed > 0 ? ` (${nums.failed} failed)` : '';
        return `${nums.complete}/${nums.total} ${itemNames}${failedSuffix}`;
      }
      case 'failed':
        return `${successCount}/${nums.total} ${itemNames} (${nums.failed} failed)`;
      case 'complete':
        return `${nums.total} ${itemNames}`;
      case 'stopped': {
        const failedSuffix = nums.failed > 0 ? `, ${nums.failed} failed` : '';
        return `${successCount} ${itemNames}${failedSuffix}`;
      }
    }
  }, [jobStatus, nums, itemNames, successCount]);

  const isDismissible =
    jobStatus === 'complete' || jobStatus === 'failed' || jobStatus === 'stopped';
  const showStopButton =
    onStopJobSequence != null && (jobStatus === 'inProgress' || jobStatus === 'stopping');

  return (
    <>
      <Alert
        variant={variant}
        className="mb-0"
        dismissible={isDismissible}
        onClose={() => onDismissCompleteJobSequence(jobSequenceId)}
      >
        <div className="d-flex flex-wrap align-items-center gap-2 gap-lg-3">
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {jobStatus === 'stopping' ? (
              <Spinner
                animation="border"
                role="status"
                aria-hidden="true"
                style={{ width: '1.25rem', height: '1.25rem', borderWidth: '0.18em' }}
              />
            ) : (
              <i className={`bi ${icon} fs-5`} aria-hidden="true" />
            )}
            <div className="d-flex flex-column">
              <strong>{text}</strong>
              {subtext && <span className="small text-body-secondary">{subtext}</span>}
            </div>
          </div>

          {(jobStatus === 'inProgress' || jobStatus === 'stopping') && (
            <div className="flex-grow-1" style={{ flexBasis: '6rem' }}>
              <ProgressBar>
                <ProgressBar
                  key="success"
                  now={progressPercent - (nums.total !== 0 ? (nums.failed / nums.total) * 100 : 0)}
                  variant={jobStatus === 'stopping' ? 'secondary' : 'primary'}
                  animated={jobStatus === 'inProgress'}
                />
                {nums.failed > 0 && (
                  <ProgressBar
                    key="failed"
                    now={(nums.failed / nums.total) * 100}
                    variant="danger"
                  />
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

            {showStopButton && jobStatus === 'inProgress' && !isStopPending && (
              <>
                <span className="text-body-secondary opacity-50" aria-hidden="true">
                  &middot;
                </span>
                <button
                  type="button"
                  className="btn btn-link p-0 align-baseline border-0 text-decoration-none link-danger"
                  style={{ fontSize: 'inherit' }}
                  aria-label="Stop job"
                  onClick={() => setShowStopConfirm(true)}
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
      </Alert>

      {onStopJobSequence != null && (
        <Modal show={showStopConfirm} onHide={() => setShowStopConfirm(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Stop AI grading</Modal.Title>
          </Modal.Header>
          <Modal.Body>In-progress submissions will finish. The rest will be skipped.</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowStopConfirm(false)}>
              Keep grading
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onStopJobSequence(jobSequenceId);
                setShowStopConfirm(false);
              }}
            >
              Stop grading
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}
