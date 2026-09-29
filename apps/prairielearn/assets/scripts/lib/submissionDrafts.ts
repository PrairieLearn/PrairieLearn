import { getQuestionFormData } from './confirmOnUnload.js';

const DRAFT_INTERVAL_MS = 10_000;
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
  let baseSubmissionId = form.dataset.submissionDraftBase ?? '';
  const clientId = crypto.randomUUID();
  let revision = 0;
  let requestInFlight = false;
  let statusTimeoutId: ReturnType<typeof setTimeout> | undefined;

  function getUnsavedFormData(forceRecheck = false) {
    const formData = getQuestionFormData(form);
    if (formData === form.dataset.originalFormData) return null;
    if (
      !forceRecheck &&
      formData === lastDraftFormData &&
      Date.now() - lastDraftSavedAt < DRAFT_RECHECK_INTERVAL_MS
    ) {
      return null;
    }
    return formData;
  }

  function getDraftBody() {
    // Send every field, as a real submission would, so that restoring the
    // draft saves exactly what the "Save" button would have.
    // Cast FormData since TS does not support this parameter,
    // see https://github.com/microsoft/TypeScript/issues/30584
    const body = new URLSearchParams(new FormData(form) as any);
    body.set('__action', 'save_draft');
    body.set('__draft_base_submission_id', baseSubmissionId);
    body.set('__draft_client_id', clientId);
    body.set('__draft_revision', String(++revision));
    return body;
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

  async function saveDraft(forceRecheck = false) {
    if (requestInFlight) return;
    const formData = getUnsavedFormData(forceRecheck);
    if (formData == null) return;

    requestInFlight = true;
    let retryWithLatestSubmission = false;
    try {
      const response = await fetch(form.action, { method: 'POST', body: getDraftBody() });
      if (response.status === 204) {
        const answerChanged = formData !== lastDraftFormData;
        lastDraftFormData = formData;
        lastDraftSavedAt = Date.now();
        if (answerChanged) showSavedStatus();
      } else if (response.status === 409) {
        const { latestSubmissionId } = (await response.json()) as {
          latestSubmissionId: string | null;
        };
        baseSubmissionId = latestSubmissionId ?? '';
        lastDraftFormData = null;
        retryWithLatestSubmission = true;
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
      if (retryWithLatestSubmission) void saveDraft();
    }
  }

  // Leaving the page or switching away from it may be the last chance to save
  // a draft, e.g. if a mobile browser discards the tab. A queued beacon does
  /** not confirm that the server saved it, so the next interval still retries. */
  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      if (getUnsavedFormData(true) != null) {
        navigator.sendBeacon(form.action, getDraftBody());
      }
    } else {
      void saveDraft(true);
    }
  }

  const intervalId = setInterval(() => void saveDraft(), DRAFT_INTERVAL_MS);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  function stop() {
    clearInterval(intervalId);
    clearTimeout(statusTimeoutId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  return stop;
}
