import { getInstanceQuestionUnsavedSubmissionDiscardUrl } from '../../../src/lib/client/url.js';
import { createInstanceQuestionTrpcClient } from '../../../src/trpc/instanceQuestion/client.js';

import { getQuestionFormData, isQuestionFormDirty } from './questionForm.js';

let pageUuid: string | undefined;

export function initializeUnsavedSubmissions(
  form: HTMLFormElement,
  config: {
    csrfToken: string;
    courseInstanceId: string;
    instanceQuestionId: string;
  },
): () => void {
  let uuid = (pageUuid ??= crypto.randomUUID());
  const client = createInstanceQuestionTrpcClient(config);
  let captureInFlight = false;
  let submitting = false;
  let recoveryDirtyTimeoutId: number | undefined;
  let lifecycleVersion = 0;
  let lastCaptureGeneration: number | undefined;
  let lastCapture: { fingerprint: Uint8Array; saved: boolean } | undefined;

  const readSnapshot = async (replaceRecovery: boolean) => {
    const captured = getQuestionFormData(form);
    const dirty = isQuestionFormDirty(form, captured);
    const banner = recoveryBanner();
    if (banner && (!replaceRecovery || banner.dataset.recoveryPending === 'true')) {
      updateRecoveryDirtyState(dirty);
      return null;
    }
    if (!dirty) return null;
    const formData: Record<string, string | string[]> = Object.fromEntries(
      Array.from(new Set(captured.keys()))
        .sort()
        .map((key) => {
          const values = captured.getAll(key).map((value) => value.toString());
          return [key, values.length === 1 ? values[0] : values];
        }),
    );
    // Keep only a digest because form data can contain large base64 uploads.
    const fingerprint = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(formData))),
    );
    if (recoveryBanner()?.dataset.recoveryPending === 'true') return null;
    return { formData, fingerprint };
  };

  const alreadyHandled = (fingerprint: Uint8Array) =>
    fingerprint.every((value, index) => value === lastCapture?.fingerprint[index]);

  const clearRecoveryDirtyTimeout = () => {
    window.clearTimeout(recoveryDirtyTimeoutId);
    recoveryDirtyTimeoutId = undefined;
  };

  const handleRecoveryInteraction = () => {
    lifecycleVersion++;
    clearRecoveryDirtyTimeout();
  };

  const recoveryBanner = () => document.getElementById('unsaved-submission-recovery');

  const updateRecoveryDirtyState = (dirty: boolean) => {
    const banner = recoveryBanner();
    if (!banner || banner.dataset.recoveryPending === 'true' || !dirty) {
      clearRecoveryDirtyTimeout();
      return;
    }
    if (recoveryDirtyTimeoutId !== undefined) return;
    recoveryDirtyTimeoutId = window.setTimeout(() => {
      recoveryDirtyTimeoutId = undefined;
      const currentBanner = recoveryBanner();
      if (!currentBanner || currentBanner.dataset.recoveryPending === 'true' || submitting) return;
      if (!isQuestionFormDirty(form)) return;
      currentBanner.dispatchEvent(new Event('unsaved-submission-recovery-expired'));
      void capture(true);
    }, 120_000);
  };

  const capture = async (replaceRecovery = false) => {
    if (captureInFlight || submitting) return;
    captureInFlight = true;
    const captureVersion = lifecycleVersion;
    try {
      const previous = await readSnapshot(replaceRecovery);
      if (!previous || alreadyHandled(previous.fingerprint)) return;
      if (captureVersion !== lifecycleVersion) return;

      // Read the generation before taking the upload's snapshot so new edits in an
      // already-open tab can still be captured after a Save in another tab.
      const generation = await client.unsavedSubmissions.generation.query();
      if (captureVersion !== lifecycleVersion) return;
      const snapshot = await readSnapshot(replaceRecovery);
      if (!snapshot || alreadyHandled(snapshot.fingerprint)) return;
      if (captureVersion !== lifecycleVersion) return;

      lastCaptureGeneration = generation;
      const { saved } = await client.unsavedSubmissions.upsert.mutate({
        uuid,
        generation,
        formData: snapshot.formData,
      });
      if (captureVersion !== lifecycleVersion) return;
      // A rejected generation is obsolete; retrying it would recreate cleared work.
      lastCapture = { fingerprint: snapshot.fingerprint, saved };
    } catch {
      // Background persistence is best effort; the next interval retries without interrupting work.
    } finally {
      captureInFlight = false;
    }
  };
  const intervalId = window.setInterval(() => void capture(), 30_000);

  const handleSubmit = (event: SubmitEvent) => {
    const action =
      event.submitter?.getAttribute('value') ??
      form.querySelector<HTMLInputElement>('input[name="__action"]')?.value;
    if (action !== 'save' && action !== 'grade') return;

    lifecycleVersion++;
    clearRecoveryDirtyTimeout();
    submitting = true;
    // Native event dispatch can run microtasks before later listeners cancel submission.
    window.setTimeout(() => {
      if (event.defaultPrevented) resetSubmitting();
    }, 0);
  };

  // Legacy Calculation clients submit through jQuery, which can bypass native submit listeners.
  const handleClick = (event: MouseEvent) => {
    if (!form.querySelector('input.postData')) return;
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('button.question-save, button.question-grade')) return;

    lifecycleVersion++;
    clearRecoveryDirtyTimeout();
    submitting = true;
    window.setTimeout(() => {
      if (event.defaultPrevented) resetSubmitting();
    }, 0);
  };

  const resetSubmitting = () => {
    submitting = false;
    if (recoveryBanner()) {
      queueMicrotask(() => updateRecoveryDirtyState(isQuestionFormDirty(form)));
    }
    if (lastCapture?.saved === false) lastCapture = undefined;
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      uuid = pageUuid = crypto.randomUUID();
      lastCaptureGeneration = undefined;
      lastCapture = undefined;
    }
    resetSubmitting();
  };

  const handlePageHide = () => {
    lifecycleVersion++;
    // A failed submission must retain its backup until the server accepts a real submission.
    if (submitting || lastCaptureGeneration === undefined) return;

    navigator.sendBeacon(
      getInstanceQuestionUnsavedSubmissionDiscardUrl(config),
      new URLSearchParams({
        __csrf_token: config.csrfToken,
        uuid,
        generation: lastCaptureGeneration.toString(),
      }),
    );
  };

  form.addEventListener('submit', handleSubmit);
  form.addEventListener('click', handleClick, true);
  form.addEventListener('input', resetSubmitting);
  form.addEventListener('change', resetSubmitting);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('unsaved-submission-recovery-interaction', handleRecoveryInteraction);

  return () => {
    lifecycleVersion++;
    window.clearInterval(intervalId);
    clearRecoveryDirtyTimeout();
    form.removeEventListener('submit', handleSubmit);
    form.removeEventListener('click', handleClick, true);
    form.removeEventListener('input', resetSubmitting);
    form.removeEventListener('change', resetSubmitting);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener(
      'unsaved-submission-recovery-interaction',
      handleRecoveryInteraction,
    );
  };
}
