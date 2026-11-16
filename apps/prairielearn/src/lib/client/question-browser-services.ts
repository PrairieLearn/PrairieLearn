import { io } from 'socket.io-client';

import type { StatusMessage, StatusMessageSubmission } from '../externalGradingSocket.types.js';
import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

import {
  createQuestionServicesClient,
  serveQuestionServices,
} from './question-browser-services.transport.js';
import type { QuestionBrowserServices } from './question-browser-services.types.js';
import { createQuestionDialogs } from './question-dialogs.js';
import { updateQuestionPagePanels } from './question-page-panels.js';

/** Application implementation; endpoints and credentials never cross the port. */
export function createQuestionServicesHost({
  document,
  variantId,
  variantToken,
  submissionRenderUrls,
  dialogData,
  isCurrent,
}: {
  document: Document;
  variantId: string;
  variantToken: string;
  submissionRenderUrls: ReadonlyMap<string, string>;
  dialogData: QuestionDialogData;
  isCurrent: () => boolean;
}): { services: QuestionBrowserServices; dispose: () => void } {
  const abortController = new AbortController();
  const dialogs = createQuestionDialogs(document, dialogData);
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
          latestSubmissions ??= new Map();
          for (const submission of msg.submissions) {
            latestSubmissions.set(submission.id, submission);
          }
          subscriptions.forEach(({ listener }) => listener(msg.submissions));
        };
        // A live update can arrive while the server is preparing the initial snapshot.
        let updatedSinceConnect = new Set<string>();
        socket.on('connect', () => {
          updatedSinceConnect = new Set();
          const updated = updatedSinceConnect;
          socket.emit(
            'init',
            { variant_id: variantId, variant_token: variantToken },
            (msg: StatusMessage | null) => {
              if (!msg || updated !== updatedSinceConnect) return;
              onStatus({ ...msg, submissions: msg.submissions.filter((s) => !updated.has(s.id)) });
            },
          );
        });
        socket.on('change:status', (msg: StatusMessage) => {
          if (msg.variant_id !== variantId) return;
          msg.submissions.forEach((s) => updatedSinceConnect.add(s.id));
          onStatus(msg);
        });
      }
      if (latestSubmissions) listener(Array.from(latestSubmissions.values()));

      return () => {
        if (subscriptions.delete(subscription) && subscriptions.size === 0) closeGradingSocket();
      };
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
