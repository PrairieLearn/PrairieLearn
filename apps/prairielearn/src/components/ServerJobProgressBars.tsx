import { useEffect, useMemo, useState } from "preact/compat";
import { Alert, ProgressBar } from "react-bootstrap";
import { io } from "socket.io-client";
import type { JobItemStatus, StatusMessageWithProgress } from "../lib/serverJobProgressSocket.shared.js";

type JobProgress = {
  jobSequenceId: string;
  numCompleted: number;
  numTotal: number;
  numFailed: number;
  itemStatuses: Record<string, JobItemStatus>;
}

export function useJobSequenceProgress(
  {
    aiGradingMode,
    jobSequenceIds,
    jobSequenceTokens
  } : {
    aiGradingMode: boolean;
    jobSequenceIds: string[],
    jobSequenceTokens: Record<string, string>
  }
) {
  const [jobsProgress, setJobsProgress] = useState<Record<string, JobProgress>>({});
  const displayedStatuses = useMemo(() => {
    const statusPrecedence: Record<string, number> = {
      'pending': 0,
      'in_progress': 1,
      'failed': 2,
      'complete': 3,
    };

    const merged: Record<string, JobItemStatus> = {};

    // Iterate through all jobs and their item statuses
    for (const job of Object.values(jobsProgress)) {
      for (const [itemId, status] of Object.entries(job.itemStatuses)) {
        const currentStatus = merged[itemId];
        
        if (!currentStatus) {
          // No status yet for this item, add it
          merged[itemId] = status;
        } else {
          // Pick the status with lower precedence (earlier in the process)
          const currentPrecedence = statusPrecedence[currentStatus] ?? 999;
          const newPrecedence = statusPrecedence[status] ?? 999;
          
          if (newPrecedence < currentPrecedence) {
            merged[itemId] = status;
          }
        }
      }
    }

    return merged;
  }, [jobsProgress]);

  useEffect(() => {
    if (!jobSequenceIds) {
      return;
    }
    if (!aiGradingMode) {
      console.log('AI grading mode disabled, not connecting to server job progress socket.');
      return;
    }

    console.log('Sockets connecting...');

    const socket = io('/server-job-progress');

    for (const jobSequenceId of jobSequenceIds) {
      socket.emit(
        'joinServerJobProgress',
        {
          job_sequence_id: jobSequenceId,
          job_sequence_token: jobSequenceTokens[jobSequenceId]
        },
        (response: StatusMessageWithProgress) => {
          console.log('response', response);
          if (!response) {
            console.error('Failed to join server job progress room');
            return;
          }
          if (!response.valid) {
            console.error('No progress data found for job sequence id:', jobSequenceId);
            return;
          }
          setJobsProgress((prev) => ({
            ...prev,
            [jobSequenceId]: {
              jobSequenceId,
              numCompleted: response.num_complete,
              numTotal: response.num_total,
              numFailed: response.num_failed,
              itemStatuses: response.item_statuses || {},
            },
          }));
        }
      )

      socket.on('serverJobProgressUpdate', (msg: StatusMessageWithProgress) => {
        if (msg.job_sequence_id !== jobSequenceId) {
            return;
        }

        console.log('msg', msg);

        const itemStatuses = msg.item_statuses || {};
        const numFailed = Object.values(itemStatuses).filter(status => status === 'failed').length;
        setJobsProgress((prev) => ({
          ...prev,
          [jobSequenceId]: {
            jobSequenceId,
            numCompleted: msg.num_complete,
            numTotal: msg.num_total,
            numFailed,
            itemStatuses,
          },
        }));
      });
    }    console.log('Sockets connected.');
    return () => {
      socket.disconnect();
      console.log('Sockets disconnected.')
    }
  }, [
    jobSequenceIds, aiGradingMode
  ])

  function handleDismissCompleteJobSequence(
    jobSequenceId: string
  ) {
    if (!(jobSequenceId in jobsProgress)) {
      return;
    }
    
    const jobProgress = jobsProgress[jobSequenceId];
    if (jobProgress.numCompleted < jobProgress.numTotal) {
      return;
    }

    setJobsProgress((prev) => {
      const newJobsProgress = { ...prev };
      delete newJobsProgress[jobSequenceId];
      return newJobsProgress;
    });
  }

  return {
    jobsProgress,
    displayedStatuses,
    handleDismissCompleteJobSequence
  };
}

function ServerJobProgressBar({
    jobSequenceId,
    inProgressText,
    inProgressIcon,
    completeText,
    completeIcon,
    failedText,
    failedIcon,
    numCompleted,
    numTotal,
    numFailed,
    itemNames,
    onDismissCompleteJobSequence
}: {
    jobSequenceId: string;
    inProgressText: string;
    inProgressIcon: string;
    completeText: string;
    completeIcon: string;
    failedText: string;
    failedIcon: string;
    numCompleted: number;
    numTotal: number;
    numFailed: number;
    /** What is being counted: e.g. submissions graded, students invited */
    itemNames: string;
    onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
    const isComplete = numCompleted >= numTotal;
    const hasFailed = isComplete && numFailed > 0;
    const text = hasFailed ? failedText : isComplete ? completeText : inProgressText;
    const icon = hasFailed ? failedIcon : isComplete ? completeIcon : inProgressIcon;
    const variant = hasFailed ? 'danger' : isComplete ? "success" : "info";

    return <Alert variant={variant} class="mb-0" dismissible={isComplete} onClose={() => onDismissCompleteJobSequence(jobSequenceId)}>
        <div class="d-flex align-items-center gap-3">
          <div class="d-flex align-items-center gap-2">
              <i class={`bi ${icon} fs-5`} aria-hidden="true" />
              <strong class="text-nowrap">{text}</strong>
          </div>
          {!isComplete && (
            <>
              <div class="flex-grow-1">
                  <ProgressBar now={(numCompleted / numTotal) * 100} striped animated variant="primary" />
              </div>
              <div class="text-muted small text-nowrap">
                  {`${numCompleted}/${numTotal} ${itemNames}`}
                  <span class='text-danger'>
                    {numFailed > 0 ? ` (${numFailed} failed)` : ''}
                  </span> 
              </div>
            </>
          )}
          {isComplete && (
            <div class="text-muted small text-nowrap">
                {hasFailed ? `${numTotal - numFailed}/${numTotal} ${itemNames} (${numFailed} failed)` : `${numTotal} ${itemNames}`}
            </div>
          )}
        </div>
    </Alert>
}

export function ServerJobProgressBars({
    inProgressText,
    inProgressIcon,
    completeText,
    completeIcon,
    failedText,
    failedIcon,
    itemNames,
    jobsProgress,
    onDismissCompleteJobSequence
}: {
    inProgressText: string;
    inProgressIcon: string;
    completeText: string;
    completeIcon: string;
    failedText: string;
    failedIcon: string;
    /** What is being counted: e.g. submissions graded, students invited */
    itemNames: string;
    jobsProgress: JobProgress[];
    onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
    return <div class="d-flex flex-column gap-3">
      {jobsProgress.map((jobProgress) => (
        <ServerJobProgressBar 
          key={`server-job-progress-bar-${jobProgress.jobSequenceId}`}
          jobSequenceId={jobProgress.jobSequenceId}
          inProgressText={inProgressText}
          inProgressIcon={inProgressIcon}
          completeText={completeText}
          completeIcon={completeIcon}
          failedText={failedText}
          failedIcon={failedIcon}
          numCompleted={jobProgress.numCompleted}
          numTotal={jobProgress.numTotal}
          numFailed={jobProgress.numFailed}
          itemNames={itemNames}
          onDismissCompleteJobSequence={onDismissCompleteJobSequence}
        />
      ))}
    </div>
}
