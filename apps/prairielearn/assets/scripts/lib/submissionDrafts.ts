import { getQuestionFormData } from './confirmOnUnload.js';

const DRAFT_INTERVAL_MS = 10_000;
const DRAFT_FAST_INTERVAL_MS = 2_000;
const DRAFT_FAST_THRESHOLD_MS = 30_000;
const DRAFT_RECHECK_INTERVAL_MS = 60_000;
const SAVED_STATUS_DURATION_MS = 2_000;

/**
 * Periodically saves the student's unsaved answer as a draft so that it can be
 * restored if the page is lost before the student clicks "Save". Drafts are
 * never submitted automatically.
 *
 * This relies on `confirmOnUnload` having been set up for the same form: its
 * `originalFormData` is the last answer the student saved, and we only save a
 * draft when the current answer differs from it.
 */
export function saveSubmissionDrafts(form: HTMLFormElement): () => void {
  let lastDraftFormData: string | null = null;
  let lastDraftSavedAt = 0;
  const baseSubmissionId = form.dataset.submissionDraftBase ?? '';
  const clientId = crypto.randomUUID();
  let revision = 0;
  let draftRequested = false;
  let requestInFlight = false;
  let stopped = false;
  let intervalMs = DRAFT_INTERVAL_MS;
  let statusTimeoutId: ReturnType<typeof setTimeout> | undefined;

  function getUnsavedFormData(forceRecheck = false) {
    const formData = getQuestionFormData(form);
    if (formData === form.dataset.originalFormData) {
      return draftRequested ? ({ formData, action: 'clear_draft' } as const) : null;
    }
    if (
      !forceRecheck &&
      formData === lastDraftFormData &&
      Date.now() - lastDraftSavedAt < DRAFT_RECHECK_INTERVAL_MS
    ) {
      return null;
    }
    return { formData, action: 'save_draft' } as const;
  }

  function getDraftBody(action: 'save_draft' | 'clear_draft') {
    // Send every field, as a real submission would, so that restoring the
    // draft saves exactly what the "Save" button would have.
    // Cast FormData since TS does not support this parameter,
    // see https://github.com/microsoft/TypeScript/issues/30584
    const body = new URLSearchParams(new FormData(form) as any);
    body.set('__action', action);
    body.set('__draft_base_submission_id', baseSubmissionId);
    body.set('__draft_client_id', clientId);
    body.set('__draft_revision', String(++revision));
    return { body, requestRevision: revision };
  }

  function showSavedStatus() {
    const saveButton = form.querySelector('.question-save');
    if (!saveButton?.parentElement) return;

    // The footer can be re-rendered (e.g. after external grading), so we
    // recreate the status if it has been removed.
    let status = form.querySelector<HTMLElement>('.js-submission-draft-status');
    if (!status) {
      status = document.createElement('span');
      status.className = 'js-submission-draft-status order-3 ms-2 small text-muted fade';
      status.textContent = 'Draft saved';
      saveButton.parentElement.append(status);
    }
    status.classList.add('show');
    clearTimeout(statusTimeoutId);
    statusTimeoutId = setTimeout(() => status.classList.remove('show'), SAVED_STATUS_DURATION_MS);
  }

  function showConflictStatus() {
    form.querySelector('.js-submission-draft-status')?.remove();
    const status = document.createElement('div');
    status.className = 'alert alert-warning mb-3';
    status.setAttribute('role', 'alert');
    status.textContent =
      'Another answer was saved for this question. Your answer is still on this page. Save it or reload to see the latest answer.';
    form.prepend(status);
  }

  async function saveDraft(forceRecheck = false) {
    if (requestInFlight || stopped) return;
    const pending = getUnsavedFormData(forceRecheck);
    if (pending == null) return;

    requestInFlight = true;
    if (pending.action === 'save_draft') draftRequested = true;
    const { body, requestRevision } = getDraftBody(pending.action);
    try {
      const response = await fetch(form.action, { method: 'POST', body });
      if (response.status === 204) {
        if (requestRevision === revision) {
          if (pending.action === 'clear_draft') {
            draftRequested = false;
            lastDraftFormData = null;
          } else {
            const answerChanged = pending.formData !== lastDraftFormData;
            lastDraftFormData = pending.formData;
            lastDraftSavedAt = Date.now();
            if (answerChanged && getQuestionFormData(form) === pending.formData) showSavedStatus();
          }
        }
      } else if (response.status === 409) {
        showConflictStatus();
        stop();
      } else if (response.status < 500) {
        // The student can no longer save this question (e.g. the assessment
        // closed), so retrying cannot succeed.
        stop();
      }
    } catch {
      // Network failures are expected (e.g. a dropped connection); we'll try
      // again on the next interval.
    } finally {
      requestInFlight = false;
      if (getQuestionFormData(form) !== pending.formData) {
        void saveDraft(true);
      }
    }
  }

  /**
   * Leaving the page or switching away from it may be the last chance to save
   * a draft, e.g. if a mobile browser discards the tab. A queued beacon cannot
   * confirm that the server saved it, so the next interval still retries.
   */
  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      const pending = getUnsavedFormData(true);
      if (pending != null) {
        if (pending.action === 'save_draft') draftRequested = true;
        navigator.sendBeacon(form.action, getDraftBody(pending.action).body);
      }
    } else {
      void saveDraft(true);
    }
  }

  function handleExamTimeRemaining(event: Event) {
    const remainingMS = (event as CustomEvent<number>).detail;
    const nextIntervalMs =
      remainingMS < DRAFT_FAST_THRESHOLD_MS ? DRAFT_FAST_INTERVAL_MS : DRAFT_INTERVAL_MS;
    if (nextIntervalMs === intervalMs) return;

    intervalMs = nextIntervalMs;
    clearInterval(intervalId);
    intervalId = setInterval(() => void saveDraft(), intervalMs);
    if (intervalMs === DRAFT_FAST_INTERVAL_MS) void saveDraft();
  }

  let intervalId = setInterval(() => void saveDraft(), intervalMs);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener('exam-time-remaining', handleExamTimeRemaining);

  function stop() {
    stopped = true;
    clearInterval(intervalId);
    clearTimeout(statusTimeoutId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('exam-time-remaining', handleExamTimeRemaining);
  }

  return stop;
}
