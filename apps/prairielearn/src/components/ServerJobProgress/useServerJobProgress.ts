import { type SetStateAction, useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

import {
  JobItemStatus,
  type JobProgress,
  type JobStatus,
  type ProgressUpdateMessage,
  deriveJobStatus,
} from '../../lib/serverJobProgressSocket.shared.js';

export type JobProgressWithStatus = JobProgress & { status: JobStatus };

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
    }, // eslint-disable-next-line @eslint-react/exhaustive-deps
    [],
  );

  /** Raw progress payloads tagged with the derived JobStatus per job. */
  const jobsProgressWithStatus = useMemo<Record<string, JobProgressWithStatus>>(() => {
    const result: Record<string, JobProgressWithStatus> = {};
    for (const [id, progress] of Object.entries(jobsProgress)) {
      result[id] = { ...progress, status: deriveJobStatus(progress) };
    }
    return result;
  }, [jobsProgress]);

  /**
   * The status to display for a specific job item across all ongoing jobs.
   *
   * If multiple jobs are processing the same item, the least progressed status is shown --
   * from highest to lowest precedence: queued, in_progress, failed, complete.
   *
   * When a job is in a stopping/stopped state, its remaining queued items are
   * dropped from the merge: that job is no longer going to grade them, so any
   * concurrent job's status for the same item should win. Items the stopping
   * job already moved past queued (in_progress, failed, complete) still count
   * — they reflect real grading work that happened before the stop.
   */
  const displayedStatuses = useMemo(() => {
    const merged: Record<string, JobItemStatus> = {};
    if (!enabled) {
      return merged;
    }
    for (const job of Object.values(jobsProgressWithStatus)) {
      if (!job.item_statuses) {
        continue;
      }
      const dropQueued = job.status === 'stopping' || job.status === 'stopped';
      for (const [itemId, status] of Object.entries(job.item_statuses)) {
        if (dropQueued && status === JobItemStatus.queued) continue;
        if (!(itemId in merged) || status < merged[itemId]) {
          merged[itemId] = status;
        }
      }
    }
    return merged;
  }, [jobsProgressWithStatus, enabled]);

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

    const isTerminal =
      jobProgress.num_complete >= jobProgress.num_total || jobProgress.stop_state === 'stopped';
    if (!isTerminal) {
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
    jobsProgress: jobsProgressWithStatus,
    displayedStatuses,
    handleAddOngoingJobSequence,
    handleDismissCompleteJobSequence,
  };
}
