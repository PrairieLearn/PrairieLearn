import { type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

import type {
  JobItemStatus,
  JobProgress,
  ProgressUpdateMessage,
} from '../../lib/serverJobProgressSocket.shared.js';

/**
 * Manages and retrieves live progress information for server jobs via WebSocket connections.
 *
 * The `ServerJobsProgressInfo` component can be used to display the retrieved progress information.
 *
 * @param params
 *
 * @param params.enabled If true, the hook connects to the WebSocket for progress updates; otherwise, it does not.
 * Use this to save resources if server job progress updates aren't needed.
 *
 * E.g. For the assessment questions page, if AI grading mode is off but AI grading jobs are ongoing in the background,
 * progress updates won't be displayed, so we can skip connecting to the WebSocket.
 *
 * @param params.initialOngoingJobSequenceTokens A mapping of ongoing job sequence IDs to their server-generated tokens. Used to authenticate the WebSocket connection for each job.
 *
 * @param params.onProgressChange Callback invoked whenever there is a change in any server job progress data
 */
export function useServerJobProgress({
  enabled,
  initialOngoingJobSequenceTokens,
  onProgressChange,
}: {
  enabled: boolean;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
  onProgressChange: () => void;
}) {
  const [jobsProgress, setJobsProgress] = useState<Record<string, JobProgress>>({});
  const [ongoingJobSequenceTokens, setOngoingJobSequenceTokens] = useState<Record<
    string,
    string
  > | null>(initialOngoingJobSequenceTokens);

  const setJobsProgressAndEmit = useCallback(
    (stateUpdater: SetStateAction<Record<string, JobProgress>>) => {
      setJobsProgress(stateUpdater);
      onProgressChange();
      // We do not include onProgressChange in the dependency array because it
      // would cause an infinite loop if the callback is not memoized.
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * The status to display for a specific job item across all ongoing jobs.
   *
   * If multiple jobs are processing the same item, the least progressed status is shown --
   * from highest to lowest precedence: queued, in_progress, failed, complete.
   */
  const displayedStatuses = useMemo(() => {
    const merged: Record<string, JobItemStatus> = {};
    if (!enabled) {
      return merged;
    }
    for (const job of Object.values(jobsProgress)) {
      if (!job.item_statuses) {
        continue;
      }
      for (const [itemId, status] of Object.entries(job.item_statuses)) {
        // show least progressed status
        if (!(itemId in merged) || status < merged[itemId]) {
          merged[itemId] = status;
        }
      }
    }
    return merged;
  }, [jobsProgress, enabled]);

  useEffect(() => {
    if (
      !ongoingJobSequenceTokens ||
      Object.keys(ongoingJobSequenceTokens).length === 0 ||
      !enabled
    ) {
      return;
    }

    const socket = io('/server-job-progress');

    for (const jobSequenceId of Object.keys(ongoingJobSequenceTokens)) {
      // Join the WebSocket room for this job sequence to receive progress updates.
      socket.emit(
        'joinServerJobProgress',
        {
          job_sequence_id: jobSequenceId,
          job_sequence_token: ongoingJobSequenceTokens[jobSequenceId],
        },
        (response: ProgressUpdateMessage) => {
          if (!response.has_progress_data) {
            return;
          }

          setJobsProgressAndEmit((prev) => ({
            ...prev,
            [jobSequenceId]: response,
          }));
        },
      );

      // Listen for progress updates for this job sequence.
      socket.on('serverJobProgressUpdate', (msg: ProgressUpdateMessage) => {
        if (msg.job_sequence_id !== jobSequenceId || !msg.has_progress_data) {
          return;
        }

        setJobsProgressAndEmit((prev) => ({
          ...prev,
          [jobSequenceId]: msg,
        }));
      });
    }
    return () => {
      socket.disconnect();
    };
  }, [ongoingJobSequenceTokens, enabled, setJobsProgressAndEmit]);

  function handleAddOngoingJobSequence(jobSequenceId: string, jobSequenceToken: string) {
    setOngoingJobSequenceTokens((prev) => ({
      ...prev,
      [jobSequenceId]: jobSequenceToken,
    }));
  }

  /**
   * When the user dismisses a completed job progress alert, remove the job from state.
   */
  function handleDismissCompleteJobSequence(jobSequenceId: string) {
    if (!(jobSequenceId in jobsProgress)) {
      return;
    }

    const jobProgress = jobsProgress[jobSequenceId];

    // Only dismiss if the job is complete.
    if (jobProgress.num_complete < jobProgress.num_total) {
      return;
    }

    setJobsProgressAndEmit((prev) => {
      const { [jobSequenceId]: _removed, ...newJobsProgress } = prev;
      return newJobsProgress;
    });

    setOngoingJobSequenceTokens((prev) => {
      if (!prev) {
        return prev;
      }
      const { [jobSequenceId]: _removed, ...newTokens } = prev;
      return newTokens;
    });
  }

  return {
    jobsProgress,
    displayedStatuses,
    handleAddOngoingJobSequence,
    handleDismissCompleteJobSequence,
  };
}
