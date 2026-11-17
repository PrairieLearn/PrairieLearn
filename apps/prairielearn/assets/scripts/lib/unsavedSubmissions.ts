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
  const uuid = (pageUuid ??= crypto.randomUUID());
  const client = createInstanceQuestionTrpcClient(config);
  let captureInFlight = false;
  let captureAttempted = false;
  let submitting = false;

  const capture = async () => {
    if (captureInFlight || submitting) return;
    captureInFlight = true;
    try {
      const captured = getQuestionFormData(form);
      if (!isQuestionFormDirty(form, captured)) return;
      const formData: Record<string, string | string[]> = Object.fromEntries(
        Array.from(new Set(captured.keys()), (key) => {
          const values = captured.getAll(key).map((value) => value.toString());
          return [key, values.length === 1 ? values[0] : values];
        }),
      );
      captureAttempted = true;
      await client.unsavedSubmissions.upsert.mutate({ uuid, formData });
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

    submitting = true;
    queueMicrotask(() => {
      if (event.defaultPrevented) submitting = false;
    });
  };

  // Legacy Calculation clients submit through jQuery, which can bypass native submit listeners.
  const handleClick = (event: MouseEvent) => {
    if (!form.querySelector('input.postData')) return;
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('button.question-save, button.question-grade')) return;

    submitting = true;
    queueMicrotask(() => {
      if (event.defaultPrevented) submitting = false;
    });
  };

  const resetSubmitting = () => {
    submitting = false;
  };

  const handlePageHide = () => {
    // A failed submission must retain its backup until the server accepts a real submission.
    if (submitting || !captureAttempted) return;

    navigator.sendBeacon(
      getInstanceQuestionUnsavedSubmissionDiscardUrl(config),
      new URLSearchParams({ __csrf_token: config.csrfToken, uuid }),
    );
  };

  form.addEventListener('submit', handleSubmit);
  form.addEventListener('click', handleClick, true);
  form.addEventListener('input', resetSubmitting);
  form.addEventListener('change', resetSubmitting);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', resetSubmitting);

  return () => {
    window.clearInterval(intervalId);
    form.removeEventListener('submit', handleSubmit);
    form.removeEventListener('click', handleClick, true);
    form.removeEventListener('input', resetSubmitting);
    form.removeEventListener('change', resetSubmitting);
    window.removeEventListener('pagehide', handlePageHide);
    window.removeEventListener('pageshow', resetSubmitting);
  };
}
