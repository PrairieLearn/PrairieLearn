import { useMemo, useState } from 'react';
import { Alert, Button, Modal, ProgressBar, Spinner } from 'react-bootstrap';

import { formatMilliDollars } from '../../lib/ai-grading-credits.js';
import { getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';
import type { JobStatus } from '../../lib/serverJobProgressSocket.shared.js';

import type { JobProgressWithStatus } from './useServerJobProgress.js';

interface StatusVisuals {
  inProgress?: string;
  stopping?: string;
  stopped?: string;
  complete?: string;
  failed?: string;
}

/**
 * Displays progress information for multiple server jobs.
 *
 * Used alongside `useServerJobProgress` to render live progress for jobs
 * delivered via WebSocket.
 *
 * @param params
 * @param params.itemNames Plural noun for job items (e.g. "submissions graded").
 * @param params.jobsProgress Per-job progress snapshots.
 * @param params.courseInstanceId Course instance ID (used to build job-log URLs).
 * @param params.statusIcons Optional Bootstrap-icon class overrides per status.
 * @param params.statusText Optional text overrides per status.
 * @param params.onDismissCompleteJobSequence Called when the user closes a terminal alert.
 * @param params.onStopJobSequence Optional; when provided, renders a Stop button on running jobs.
 */
export function ServerJobsProgressInfo({
  itemNames,
  jobsProgress,
  courseInstanceId,
  statusIcons = {},
  statusText = {},
  onDismissCompleteJobSequence,
  onStopJobSequence,
}: {
  itemNames: string;
  jobsProgress: JobProgressWithStatus[];
  courseInstanceId: string;
  statusIcons?: StatusVisuals;
  statusText?: StatusVisuals;
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
  onStopJobSequence?: (jobSequenceId: string) => void;
}) {
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
          onDismissCompleteJobSequence={onDismissCompleteJobSequence}
          onStopJobSequence={onStopJobSequence}
        />
      ))}
    </div>
  );
}

const DEFAULT_DISPLAY: Record<JobStatus, { text: string; icon: string; variant: string }> = {
  inProgress: { text: 'Job in progress', icon: 'bi-hourglass-split', variant: 'info' },
  stopping: { text: 'Stopping…', icon: 'bi-stop-circle-fill', variant: 'secondary' },
  stopped: { text: 'Stopped', icon: 'bi-stop-circle-fill', variant: 'secondary' },
  complete: { text: 'Job complete', icon: 'bi-check-circle-fill', variant: 'success' },
  failed: { text: 'Job failed', icon: 'bi-exclamation-triangle-fill', variant: 'danger' },
};

/** Displays progress information for a single server job. */
function ServerJobProgressInfo({
  jobSequenceId,
  courseInstanceId,
  itemNames,
  status,
  nums,
  statusIcons,
  statusText,
  totalCostMilliDollars,
  numItemsIncurredCost,
  onDismissCompleteJobSequence,
  onStopJobSequence,
}: {
  jobSequenceId: string;
  courseInstanceId: string;
  itemNames: string;
  status: JobStatus;
  nums: { complete: number; failed: number; total: number };
  statusIcons: StatusVisuals;
  statusText: StatusVisuals;
  totalCostMilliDollars?: number;
  numItemsIncurredCost?: number;
  onDismissCompleteJobSequence: (jobSequenceId: string) => void;
  onStopJobSequence?: (jobSequenceId: string) => void;
}) {
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const display = {
    text: statusText[status] ?? DEFAULT_DISPLAY[status].text,
    icon: statusIcons[status] ?? DEFAULT_DISPLAY[status].icon,
    variant: DEFAULT_DISPLAY[status].variant,
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

  const isDismissible = status === 'complete' || status === 'failed' || status === 'stopped';
  const showStopButton = onStopJobSequence != null && status === 'inProgress';

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
