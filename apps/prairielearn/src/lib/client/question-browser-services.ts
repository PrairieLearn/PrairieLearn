import { io } from 'socket.io-client';

import type { StatusMessage } from '../externalGradingSocket.types.js';
import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

import type { QuestionBrowserServices } from './question-browser-services.types.js';
import { createQuestionDialogs } from './question-dialogs.js';
import { updateQuestionPagePanels } from './question-page-panels.js';

/** Same-document adapter, constructed by the application for the active view. */
export function createLocalQuestionBrowserServices({
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
  const subscriptions = new Set<() => void>();
  const dialogs = createQuestionDialogs(document, dialogData);
  let renderSequence = 0;
  let appliedPageSequence = 0;
  const submissionSequences = new Map<string, number>();

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
      const socket = io('/external-grading');
      let closed = false;
      const onStatus = (msg: StatusMessage | null) => {
        if (closed || abortController.signal.aborted || !isCurrent()) return;
        if (msg?.variant_id !== variantId) return;
        listener(msg.submissions);
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
      dialogs.dispose();
      subscriptions.forEach((unsubscribe) => unsubscribe());
    },
  };
}
