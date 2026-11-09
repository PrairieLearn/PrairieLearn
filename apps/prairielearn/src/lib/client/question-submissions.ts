import type { StatusMessageSubmission } from '../externalGradingSocket.types.js';

import type {
  QuestionBrowserServices,
  QuestionContentPanels,
} from './question-browser-services.types.js';

interface RenderRequest {
  controller: AbortController;
  purpose: 'history' | 'grading-result';
}

interface SubmissionState {
  status: StatusMessageSubmission;
  renderedJobId: string | null | undefined;
  request?: RenderRequest;
}

/** Coordinates history and grading renders for one question view. */
export function createQuestionSubmissions({
  services,
  submissions,
  externalGrading,
  isCurrent,
  onStatus,
  onRender,
  onError,
}: {
  services: QuestionBrowserServices;
  submissions: StatusMessageSubmission[];
  externalGrading: boolean;
  isCurrent: () => boolean;
  onStatus: (submission: StatusMessageSubmission) => void;
  onRender: (submissionId: string, panels: QuestionContentPanels) => void;
  onError: (submissionId: string) => void;
}): { loadHistory: (submissionId: string) => void; dispose: () => void } {
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  const states = new Map<string, SubmissionState>(
    submissions.map((status) => [
      status.id,
      {
        status,
        renderedJobId: status.grading_job_status === 'graded' ? status.grading_job_id : undefined,
      },
    ]),
  );

  function needsResult(state: SubmissionState) {
    return (
      state.status.grading_job_status === 'graded' &&
      state.renderedJobId !== state.status.grading_job_id
    );
  }

  function gradingPending(state: SubmissionState) {
    return !['graded', 'none', 'canceled'].includes(state.status.grading_job_status);
  }

  function closeIfComplete() {
    if ([...states.values()].some((state) => gradingPending(state) || needsResult(state))) return;
    unsubscribe?.();
    unsubscribe = undefined;
  }

  function load(submissionId: string) {
    if (disposed || !isCurrent()) return;
    const state = states.get(submissionId);
    if (!state) return;
    const purpose = needsResult(state) ? 'grading-result' : 'history';
    if (state.request) {
      // Opening history must not cancel a grading refresh that also updates scores.
      if (state.request.purpose === 'grading-result' || purpose === 'history') return;
      state.request.controller.abort();
    }
    const request: RenderRequest = { controller: new AbortController(), purpose };
    const jobId = state.status.grading_job_id;
    state.request = request;
    const current = () =>
      !disposed && isCurrent() && state.request === request && !request.controller.signal.aborted;

    void services
      .renderSubmission({ submissionId, purpose }, { signal: request.controller.signal })
      .then((panels) => {
        if (!current()) return;
        onRender(submissionId, panels);
        if (purpose === 'grading-result') state.renderedJobId = jobId;
      })
      .catch((err) => {
        if (!current() || err.name === 'AbortError') return;
        onError(submissionId);
      })
      .finally(() => {
        if (state.request !== request) return;
        state.request = undefined;
        closeIfComplete();
      });
  }

  if (externalGrading) {
    submissions.forEach(onStatus);
    if ([...states.values()].some(gradingPending)) {
      unsubscribe = services.subscribeToGradingStatus((updates) => {
        if (disposed || !isCurrent()) return;
        for (const status of updates) {
          const state = states.get(status.id);
          if (!state) continue;
          if (state.status.grading_job_id !== status.grading_job_id) {
            state.request?.controller.abort();
            state.request = undefined;
          }
          state.status = status;
          onStatus(status);
          if (needsResult(state)) load(status.id);
        }
        closeIfComplete();
      });
    }
  }

  return {
    loadHistory: load,
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = undefined;
      states.forEach((state) => state.request?.controller.abort());
    },
  };
}
