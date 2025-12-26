import { useEffect, useMemo, useState } from 'preact/compat';
import { io } from 'socket.io-client';

import type { JobItemStatus, StatusMessageWithProgress, StatusMessageWithProgressValid } from '../../lib/serverJobProgressSocket.shared.js';

export function useJobSequenceProgress({
  aiGradingMode,
  jobSequenceIds,
  jobSequenceTokens,
}: {
  aiGradingMode: boolean;
  jobSequenceIds: string[];
  jobSequenceTokens: Record<string, string>;
}) {
  const [jobsProgress, setJobsProgress] = useState<Record<string, StatusMessageWithProgress>>({});

  // An instance question's displayed status is the minimum status
  // across all jobs grading it. 
  const displayedStatuses = useMemo(() => {
    const merged: Record<string, JobItemStatus> = {};
    if (!aiGradingMode) {
        return merged;
    }
    for (const job of Object.values(jobsProgress)) {
        if (!job.item_statuses) {
            continue;
        }
        for (const [itemId, status] of Object.entries(job.item_statuses)) {
            if (!(itemId in merged) || status < merged[itemId]) {
                merged[itemId] = status;
            }
        }
    }
    return merged;
  }, [jobsProgress, aiGradingMode]);

  useEffect(() => {
    if (jobSequenceIds.length === 0 || !aiGradingMode) {
      return;
    }

    const socket = io('/server-job-progress');

    for (const jobSequenceId of jobSequenceIds) {
      socket.emit(
        'joinServerJobProgress',
        {
          job_sequence_id: jobSequenceId,
          job_sequence_token: jobSequenceTokens[jobSequenceId],
        },
        (response: StatusMessageWithProgressValid) => {
          if (!response.valid) {
            return;
          }
          setJobsProgress((prev) => ({
            ...prev,
            [jobSequenceId]: response
          }));
        },
      );

      socket.on('serverJobProgressUpdate', (msg: StatusMessageWithProgress) => {
        if (msg.job_sequence_id !== jobSequenceId) {
          return;
        }
        setJobsProgress((prev) => ({
          ...prev,
          [jobSequenceId]: msg
        }));
      });
    }
    return () => {
      socket.disconnect();
    };
  }, [jobSequenceTokens, jobSequenceIds, aiGradingMode]);

  function handleDismissCompleteJobSequence(jobSequenceId: string) {
    if (!(jobSequenceId in jobsProgress)) {
      return;
    }

    const jobProgress = jobsProgress[jobSequenceId];
    if (jobProgress.num_complete < jobProgress.num_total) {
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
    handleDismissCompleteJobSequence,
  };
}
