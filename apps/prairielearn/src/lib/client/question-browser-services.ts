import { io } from 'socket.io-client';

import type { StatusMessage, StatusMessageSubmission } from '../externalGradingSocket.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

import {
  createQuestionServicesClient,
  serveQuestionServices,
} from './question-browser-services.transport.js';
import type { QuestionBrowserServices } from './question-browser-services.types.js';
import { updateQuestionPagePanels } from './question-page-panels.js';

/** Application implementation; endpoints and credentials never cross the port. */
export function createQuestionServicesHost({
  document,
  variantId,
  variantToken,
  submissionRenderUrls,
  isCurrent,
}: {
  document: Document;
  variantId: string;
  variantToken: string;
  submissionRenderUrls: ReadonlyMap<string, string>;
  isCurrent: () => boolean;
}): { services: QuestionBrowserServices; dispose: () => void } {
  const abortController = new AbortController();
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
    async renderSubmission({ submissionId, purpose }, { signal }) {
      assertCurrent();
      const renderUrl = submissionRenderUrls.get(submissionId);
      if (!renderUrl) throw new Error('Unknown submission');

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
      updateQuestionPagePanels(document, panels);

      // Select these fields explicitly: the question renderer must not receive
      // application score or navigation panels. Returning `panels` would include
      // them at runtime even though QuestionContentPanels omits them in TypeScript.
      return {
        submissionPanel: panels.submissionPanel,
        extraHeadersHtml: panels.extraHeadersHtml,
        answerPanel: panels.answerPanel,
        questionPanelFooter: panels.questionPanelFooter,
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
        socket.on('connect', () => {
          socket.emit('init', { variant_id: variantId, variant_token: variantToken }, onStatus);
        });
        socket.on('change:status', onStatus);
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
