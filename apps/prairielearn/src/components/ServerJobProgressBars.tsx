import { useEffect, useMemo, useState } from "preact/compat";
import { Alert, ProgressBar } from "react-bootstrap";
import { io } from "socket.io-client";
import type { JobItemStatus, StatusMessageWithProgress } from "../lib/serverJobProgressSocket.shared.js";

type JobProgress = {
  jobSequenceId: string;
  numCompleted: number;
  numTotal: number;
  itemStatuses: Record<string, JobItemStatus>;
}

export function useJobSequenceProgress(
  {
    jobSequenceIds,
    jobSequenceTokens
  } : {
    jobSequenceIds: string[],
    jobSequenceTokens: Record<string, string>
  }
) {
  // TODO: if Ai grading mode is off, then don't establish any socket connections.
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
    const socket = io('/server-job-progress');

    if (!jobSequenceIds) {
      return;
    }

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

        setJobsProgress((prev) => ({
          ...prev,
          [jobSequenceId]: {
            jobSequenceId,
            numCompleted: msg.num_complete,
            numTotal: msg.num_total,
            itemStatuses: msg.item_statuses || {},
          },
        }));
      });
    }
  }, [
    jobSequenceIds
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
    numCompleted,
    numTotal,
    itemNames,
    onDismissCompleteJobSequence
}: {
    jobSequenceId: string;
    inProgressText: string;
    inProgressIcon: string;
    completeText: string;
    completeIcon: string;
    numCompleted: number;
    numTotal: number;
    /** What is being counted: e.g. submissions graded, students invited */
    itemNames: string;
    onDismissCompleteJobSequence: (jobSequenceId: string) => void;
}) {
    const isComplete = numCompleted >= numTotal;
    const text = isComplete ? completeText : inProgressText;
    const icon = isComplete ? completeIcon : inProgressIcon;
    const variant = isComplete ? "success" : "info";

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
              </div>
            </>
          )}
          {isComplete && (
            <div class="text-muted small text-nowrap">
                {`${numTotal} ${itemNames}`}
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
    itemNames,
    jobsProgress,
    onDismissCompleteJobSequence
}: {
    inProgressText: string;
    inProgressIcon: string;
    completeText: string;
    completeIcon: string;
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
          numCompleted={jobProgress.numCompleted}
          numTotal={jobProgress.numTotal}
          itemNames={itemNames}
          onDismissCompleteJobSequence={onDismissCompleteJobSequence}
        />
      ))}
    </div>
}
