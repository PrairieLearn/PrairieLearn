import { io } from 'socket.io-client';

import type { StatusMessage } from '../externalGradingSocket.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

import type { QuestionBrowserServices } from './question-browser-services.types.js';
import { updateQuestionPagePanels } from './question-page-panels.js';

/** Same-document adapter, constructed by the application for the active view. */
export function createLocalQuestionBrowserServices({
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
  const subscriptions = new Set<() => void>();

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
      if (purpose === 'grading-result') url.searchParams.set('render_score_panels', 'true');

      const requestSignal = AbortSignal.any([signal, abortController.signal]);
      const response = await fetch(url, { signal: requestSignal });
      if (!response.ok) throw new Error('Failed to fetch submission');
      const panels: SubmissionPanels = await response.json();

      // Aborting fetch alone is insufficient if the response was already received.
      requestSignal.throwIfAborted();
      assertCurrent();
      updateQuestionPagePanels(document, panels);

      // Only content intended for the question document crosses this boundary.
      return {
        submissionPanel: panels.submissionPanel,
        extraHeadersHtml: panels.extraHeadersHtml,
        answerPanel: panels.answerPanel,
        questionPanelFooter: panels.questionPanelFooter,
      };
    },

    subscribeToGradingStatus(listener) {
      assertCurrent();
      const socket = io('/external-grading');
      let closed = false;
      const onStatus = (msg: StatusMessage) => {
        if (closed || abortController.signal.aborted || !isCurrent()) return;
        if (msg.variant_id !== variantId) return;
        listener(msg.submissions);
      };
      socket.on('connect', () => {
        socket.emit('init', { variant_id: variantId, variant_token: variantToken }, onStatus);
      });
      socket.on('change:status', onStatus);

      const unsubscribe = () => {
        closed = true;
        socket.removeAllListeners();
        socket.close();
        subscriptions.delete(unsubscribe);
      };
      subscriptions.add(unsubscribe);
      return unsubscribe;
    },
  };

  return {
    services,
    dispose() {
      abortController.abort();
      subscriptions.forEach((unsubscribe) => unsubscribe());
    },
  };
}
