import { useMemo, useState } from 'react';
import { Alert, Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';

import { formatMilliDollars } from '../../lib/ai-grading-credits.js';
import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';
import type { JobStatus } from '../../lib/serverJobProgressSocket.shared.js';

import type { JobProgressWithStatus } from './useServerJobProgress.js';

type StopProps =
  | { stoppable?: false }
  | {
      stoppable: true;
      onStopJobSequence: (jobSequenceId: string) => void;
      stopConfirmation?: {
        title?: string;
        body?: string;
        confirmLabel?: string;
        cancelLabel?: string;
      };
    };

/**
 * Displays progress information for multiple server jobs.
 *
 * This is used alongside the `useServerJobProgress` hook to display live progress information
 * for server jobs, retrieved via WebSocket connections.
 *
 * Pass `stoppable: true` along with `onStopJobSequence` (and optionally
 * `stopConfirmation`) to render a Stop button on running jobs. Otherwise the
 * Stop button is hidden.
 *
 * @param params
 * @param params.itemNames What the name of the job items are (e.g. "submissions graded", "students invited").
 * @param params.jobsProgress Progress information for each server job.
 * @param params.courseInstanceId The course instance ID of the server jobs.
 * @param params.statusIcons Icons for indicating the server job status.
 * @param params.statusText Text describing the server job status.
 * @param params.onDismissCompleteJobSequence Callback when the user dismisses a completed job progress alert.
 */
export function ServerJobsProgressInfo({
  itemNames,
  jobsProgress,
  courseInstanceId,
  statusIcons = {},
  statusText = {},
  onDismissCompleteJobSequence,
  ...stopProps
}: {
  itemNames: string;
  jobsProgress: JobProgressWithStatus[];
  courseInstanceId: string;
  statusIcons?: {
    inProgress?: string;
    stopping?: string;
    stopped?: string;
    complete?: string;
    failed?: string;
  };
  statusText?: {
    inProgress?: string;
    stopping?: string;
    stopped?: string;
    complete?: string;
    failed?: string;
  };
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
} & StopProps) {
  return (
    <div className={`d-flex flex-column gap-3 ${jobsProgress.length > 0 ? 'mb-3' : ''}`}>
      {jobsProgress.map((jobProgress) => (
        <ServerJobProgressInfo
          key={`server-job-progress-bar-${jobProgress.job_sequence_id}`}
          jobSequenceId={jobProgress.job_sequence_id}
          courseInstanceId={courseInstanceId}
          status={jobProgress.status}
          nums={{
            complete: jobProgress.num_complete,
            failed: jobProgress.num_failed,
            total: jobProgress.num_total,
          }}
          statusIcons={statusIcons}
          statusText={{
            ...statusText,
            failed: jobProgress.job_failure_message ?? statusText.failed,
          }}
          itemNames={itemNames}
          totalCostMilliDollars={jobProgress.total_cost_milli_dollars}
          numItemsIncurredCost={jobProgress.num_items_incurred_cost}
          jobFailureDetail={jobProgress.job_failure_detail}
          onDismissCompleteJobSequence={onDismissCompleteJobSequence}
          {...stopProps}
        />
      ))}
    </div>
  );
}

const DEFAULT_STOP_CONFIRMATION = {
  title: 'Stop jobs?',
  body: 'In-progress jobs will finish; no new jobs will be started.',
  confirmLabel: 'Stop',
  cancelLabel: 'Keep running',
};

const DEFAULT_DISPLAY: Record<JobStatus, { text: string; icon: string; variant: string }> = {
  inProgress: { text: 'Job in progress', icon: 'bi-hourglass-split', variant: 'info' },
  stopping: { text: 'Stopping…', icon: 'bi-stop-circle-fill', variant: 'secondary' },
  stopped: { text: 'Stopped', icon: 'bi-stop-circle-fill', variant: 'secondary' },
  complete: { text: 'Job complete', icon: 'bi-check-circle-fill', variant: 'success' },
  failed: { text: 'Job failed', icon: 'bi-exclamation-triangle-fill', variant: 'danger' },
};

/**
 * Displays progress information for a single server job.
 *
 * Pass `stoppable: true` along with `onStopJobSequence` (and optionally
 * `stopConfirmation`) to render a Stop button while the job is running.
 *
 * @param props The component props.
 */
function ServerJobProgressInfo(
  props: {
    jobSequenceId: string;
    courseInstanceId: string;
    itemNames: string;
    status: JobStatus;
    nums: { complete: number; failed: number; total: number };
    statusIcons: {
      inProgress?: string;
      stopping?: string;
      stopped?: string;
      complete?: string;
      failed?: string;
    };
    statusText: {
      inProgress?: string;
      stopping?: string;
      stopped?: string;
      complete?: string;
      failed?: string;
    };
    totalCostMilliDollars?: number;
    numItemsIncurredCost?: number;
    jobFailureDetail?: string;
    onDismissCompleteJobSequence: (jobSequenceId: string) => void;
  } & StopProps,
) {
  const {
    jobSequenceId,
    courseInstanceId,
    itemNames,
    status,
    nums,
    statusIcons,
    statusText,
    totalCostMilliDollars,
    numItemsIncurredCost,
    jobFailureDetail,
    onDismissCompleteJobSequence,
  } = props;
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const display = {
    text: statusText[status] ?? DEFAULT_DISPLAY[status].text,
    icon: statusIcons[status] ?? DEFAULT_DISPLAY[status].icon,
    variant: DEFAULT_DISPLAY[status].variant,
  };

  const stopCopy = {
    title: (props.stoppable && props.stopConfirmation?.title) || DEFAULT_STOP_CONFIRMATION.title,
    body: (props.stoppable && props.stopConfirmation?.body) || DEFAULT_STOP_CONFIRMATION.body,
    confirmLabel:
      (props.stoppable && props.stopConfirmation?.confirmLabel) ||
      DEFAULT_STOP_CONFIRMATION.confirmLabel,
    cancelLabel:
      (props.stoppable && props.stopConfirmation?.cancelLabel) ||
      DEFAULT_STOP_CONFIRMATION.cancelLabel,
  };

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
    switch (status) {
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
  }, [status, nums, itemNames, successCount]);

  const isDismissible = (['complete', 'failed', 'stopped'] as readonly JobStatus[]).includes(
    status,
  );
  const showStopButton = props.stoppable === true && status === 'inProgress';

  return (
    <>
      <Alert
        variant={display.variant}
        className="mb-0"
        dismissible={isDismissible}
        onClose={() => onDismissCompleteJobSequence(jobSequenceId)}
      >
        <div className="d-flex flex-wrap align-items-center gap-2 gap-lg-3">
          <div className="d-flex align-items-center gap-2 flex-shrink-0">
            {status === 'stopping' ? (
              <Spinner
                animation="border"
                role="status"
                aria-hidden="true"
                style={{ width: '1.25rem', height: '1.25rem', borderWidth: '0.18em' }}
              />
            ) : (
              <i className={`bi ${display.icon} fs-5`} aria-hidden="true" />
            )}
            <strong>{display.text}</strong>
          </div>

          {(status === 'inProgress' || status === 'stopping') && (
            <div className="flex-grow-1" style={{ flexBasis: '6rem' }}>
              <ProgressBar>
                <ProgressBar
                  key="success"
                  now={progressPercent - (nums.total !== 0 ? (nums.failed / nums.total) * 100 : 0)}
                  variant={status === 'stopping' ? 'secondary' : 'primary'}
                  animated={status === 'inProgress'}
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

            {showStopButton && (
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
        {status === 'failed' && jobFailureDetail && (
          <div className="small text-body-secondary mt-2">
            <strong>Error:</strong> {jobFailureDetail}
          </div>
        )}
      </Alert>

      {props.stoppable === true && (
        <Modal show={showStopConfirm} onHide={() => setShowStopConfirm(false)}>
          <Modal.Header closeButton>
            <Modal.Title>{stopCopy.title}</Modal.Title>
          </Modal.Header>
          <Modal.Body>{stopCopy.body}</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowStopConfirm(false)}>
              {stopCopy.cancelLabel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                props.onStopJobSequence(jobSequenceId);
                setShowStopConfirm(false);
              }}
            >
              {stopCopy.confirmLabel}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
}
