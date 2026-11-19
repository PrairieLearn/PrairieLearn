import { io } from 'socket.io-client';

import type { StatusMessage, StatusMessageSubmission } from '../externalGradingSocket.types.js';
import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

import { consumeSkippedFormConfirmation } from './confirm-on-unload.js';
import {
  createQuestionServicesClient,
  serveQuestionServices,
} from './question-browser-services.transport.js';
import type {
  QuestionBrowserServices,
  QuestionNavigationTarget,
} from './question-browser-services.types.js';
import { createQuestionDialogs } from './question-dialogs.js';
import { isStaleGradingStatus } from './question-grading-status.js';
import { updateQuestionPagePanels } from './question-page-panels.js';

// The application adds these to submitted answers; the question cannot supply them.
const RESERVED_ANSWER_FIELDS = new Set(['__action', '__csrf_token', '__variant_id']);

/** Application implementation; endpoints and credentials never cross the port. */
export function createQuestionServicesHost({
  document,
  variantId,
  variantToken,
  csrfToken,
  submissionRenderUrls,
  navigationUrls,
  dialogData,
  isCurrent,
}: {
  document: Document;
  variantId: string;
  variantToken: string;
  csrfToken: string;
  submissionRenderUrls: ReadonlyMap<string, string>;
  navigationUrls: Partial<Record<QuestionNavigationTarget, string>>;
  dialogData: QuestionDialogData;
  isCurrent: () => boolean;
}): { services: QuestionBrowserServices; dispose: () => void } {
  const abortController = new AbortController();
  const dialogs = createQuestionDialogs(document, dialogData);
  let answersDirty = false;
  let answersSubmitted = false;
  document.defaultView!.addEventListener(
    'beforeunload',
    (event) => {
      // The exam time limit skips this warning when it submits the assessment.
      if (!answersDirty || consumeSkippedFormConfirmation()) return;
      // Best practice per MDN is to call preventDefault() and set returnValue for legacy support.
      event.preventDefault();
      // oxlint-disable-next-line typescript/no-deprecated -- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event#usage_notes
      event.returnValue = 'prompt';
    },
    { signal: abortController.signal },
  );
  let renderSequence = 0;
  let appliedPageSequence = 0;
  const submissionSequences = new Map<string, number>();
  const subscriptions = new Set<{
    listener: (submissions: StatusMessageSubmission[]) => void;
  }>();
  let gradingSocket: ReturnType<typeof io> | undefined;
  let latestSubmissions: Map<string, StatusMessageSubmission> | undefined;

  function closeGradingSocket() {
    gradingSocket?.removeAllListeners();
    gradingSocket?.close();
    gradingSocket = undefined;
    latestSubmissions = undefined;
  }

  function assertCurrent() {
    abortController.signal.throwIfAborted();
    if (!isCurrent()) throw new DOMException('Question view was removed', 'AbortError');
  }

  const services: QuestionBrowserServices = {
    async openCopyQuestion() {
      assertCurrent();
      await dialogs.openCopyQuestion();
    },

    async openSubmissionInfo(request) {
      assertCurrent();
      await dialogs.openSubmissionInfo(request);
    },

    async renderSubmission({ submissionId, purpose }, { signal }) {
      assertCurrent();
      const renderUrl = submissionRenderUrls.get(submissionId);
      if (!renderUrl) throw new Error('Unknown submission');

      const sequence = ++renderSequence;
      submissionSequences.set(submissionId, sequence);
      const url = new URL(renderUrl, document.location.origin);
      if (url.origin !== document.location.origin) {
        throw new Error('Submission render URL must be same-origin');
      }
      if (purpose === 'grading-result') url.searchParams.set('render_score_panels', 'true');

      const requestSignal = AbortSignal.any([signal, abortController.signal]);
      const response = await fetch(url, { signal: requestSignal, mode: 'same-origin' });
      if (!response.ok) throw new Error('Failed to fetch submission');
      const panels: SubmissionPanels = await response.json();

      // Aborting fetch alone is insufficient if the response was already received.
      requestSignal.throwIfAborted();
      assertCurrent();
      if (submissionSequences.get(submissionId) !== sequence) {
        throw new DOMException('Submission render was superseded', 'AbortError');
      }
      // Different submissions share scores, the answer, and the question footer.
      // An older response may still supply its own submission, but not those panels.
      const updatePage = purpose === 'grading-result' && sequence > appliedPageSequence;
      if (updatePage) {
        appliedPageSequence = sequence;
        updateQuestionPagePanels(document, panels);
      }
      if (panels.submissionInfo) dialogs.updateSubmissionInfo(panels.submissionInfo);

      // Select these fields explicitly: the question renderer must not receive
      // application score or navigation panels. Returning `panels` would include
      // them at runtime even though QuestionContentPanels omits them in TypeScript.
      return {
        submissionPanel: panels.submissionPanel,
        extraHeadersHtml: panels.extraHeadersHtml,
        answerPanel: updatePage ? panels.answerPanel : null,
        questionPanelFooter: updatePage ? panels.questionPanelFooter : null,
      };
    },

    subscribeToGradingStatus(listener) {
      assertCurrent();
      const subscription = { listener };
      subscriptions.add(subscription);
      // A view owns one socket, regardless of how many protocol subscriptions
      // the question creates. Later subscribers receive its latest snapshot.
      if (!gradingSocket) {
        const socket = io('/external-grading');
        gradingSocket = socket;
        const onStatus = (msg: StatusMessage | null) => {
          if (msg == null) return;
          if (gradingSocket !== socket || abortController.signal.aborted || !isCurrent()) return;
          if (msg.variant_id !== variantId) return;
          const latest = (latestSubmissions ??= new Map());
          const updates = msg.submissions.filter((submission) => {
            const previous = latest.get(submission.id);
            if (isStaleGradingStatus(submission, previous)) return false;
            if (
              previous &&
              (previous.grading_job_id || null) !== (submission.grading_job_id || null)
            ) {
              // UI cancellation crosses the port asynchronously. Invalidate here
              // before an old response can update scores or dialog metadata.
              submissionSequences.delete(submission.id);
            }
            latest.set(submission.id, submission);
            return true;
          });
          subscriptions.forEach(({ listener }) => listener(updates));
        };
        let connection = 0;
        socket.on('connect', () => {
          const currentConnection = ++connection;
          socket.emit(
            'init',
            { variant_id: variantId, variant_token: variantToken },
            (msg: StatusMessage | null) => {
              if (currentConnection !== connection) return;
              onStatus(msg);
            },
          );
        });
        socket.on('change:status', onStatus);
      }
      if (latestSubmissions) listener(Array.from(latestSubmissions.values()));

      return () => {
        if (subscriptions.delete(subscription) && subscriptions.size === 0) closeGradingSocket();
      };
    },

    async submitAnswer({ action, entries }) {
      assertCurrent();
      if (answersSubmitted) throw new Error('Answers were already submitted');
      if (entries.some(([name]) => RESERVED_ANSWER_FIELDS.has(name))) {
        throw new Error('Answers cannot include reserved fields');
      }
      // Post natively to the page URL, as the question form would, so the server's
      // redirect, flash messages, and checks are unchanged.
      const form = document.createElement('form');
      form.method = 'POST';
      form.hidden = true;
      const fields: [string, string][] = [
        ['__csrf_token', csrfToken],
        ['__variant_id', variantId],
        ['__action', action],
        ...entries,
      ];
      form.append(
        ...fields.map(([name, value]) => {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          return input;
        }),
      );
      document.body.append(form);
      answersSubmitted = true;
      // Clear the unsaved state rather than skipping the warning after a submission:
      // if the page stays, for example because the user stopped the navigation,
      // edits made afterwards must warn again. The question saves its form state
      // before sending this request, and port messages are ordered, so later
      // reports reflect only those edits.
      answersDirty = false;
      // An answer named `submit` would shadow `form.submit`, so calling it would
      // throw instead of posting. The question form avoided this by submitting
      // through its buttons.
      HTMLFormElement.prototype.submit.call(form);
    },

    async navigate({ target }) {
      assertCurrent();
      const navigationUrl = navigationUrls[target];
      if (!navigationUrl) throw new Error('Navigation is unavailable');
      const url = new URL(navigationUrl, document.location.origin);
      if (url.origin !== document.location.origin) {
        throw new Error('Navigation URL must be same-origin');
      }
      document.location.assign(url);
    },

    reportAnswerState({ dirty }) {
      answersDirty = dirty;
    },
  };

  return {
    services,
    dispose() {
      abortController.abort();
      dialogs.dispose();
      subscriptions.clear();
      closeGradingSocket();
    },
  };
}

/** Same-document wiring using the same port transport as a future iframe. */
export function createLocalQuestionBrowserServices(
  options: Parameters<typeof createQuestionServicesHost>[0],
): { services: QuestionBrowserServices; dispose: () => void } {
  const channel = new MessageChannel();
  const disposeHost = serveQuestionServices(channel.port1, createQuestionServicesHost(options));
  const client = createQuestionServicesClient(channel.port2);
  return {
    services: client.services,
    dispose() {
      client.dispose();
      disposeHost();
    },
  };
}
