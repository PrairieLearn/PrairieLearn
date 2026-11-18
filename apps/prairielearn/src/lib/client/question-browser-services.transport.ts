import {
  type QuestionServiceRequest,
  QuestionServiceRequestSchema,
  type QuestionServiceResponse,
  QuestionServiceResponseSchema,
} from './question-browser-services.protocol.js';
import type {
  QuestionBrowserServices,
  QuestionContentPanels,
} from './question-browser-services.types.js';

type WithoutId<Request> = Request extends unknown ? Omit<Request, 'id'> : never;

/** Requests that complete without data. The client assigns their IDs. */
type ActionRequest = WithoutId<
  Extract<
    QuestionServiceRequest,
    { type: 'open-copy-question' | 'open-submission-info' | 'submit-answer' | 'navigate' }
  >
>;

function abortError() {
  return new DOMException('Question service request aborted', 'AbortError');
}

/** The UI endpoint. This port may live in a different window from its host. */
export function createQuestionServicesClient(port: MessagePort): {
  services: QuestionBrowserServices;
  dispose: () => void;
} {
  let nextId = 0;
  let disposed = false;
  const requests = new Map<
    number,
    { resolve: (panels: QuestionContentPanels) => void; reject: (error: Error) => void }
  >();
  // Requests that complete without data, such as dialogs and submissions.
  const actions = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  const listeners = new Map<
    number,
    Parameters<QuestionBrowserServices['subscribeToGradingStatus']>[0]
  >();
  const send = (message: QuestionServiceRequest) => port.postMessage(message);

  function dispose() {
    if (disposed) return;
    disposed = true;
    send({ type: 'dispose' });
    requests.forEach(({ reject }) => reject(abortError()));
    requests.clear();
    actions.forEach(({ reject }) => reject(abortError()));
    actions.clear();
    listeners.clear();
    port.onmessage = null;
    port.onmessageerror = null;
    port.close();
  }

  port.onmessageerror = dispose;
  port.onmessage = ({ data }: MessageEvent<unknown>) => {
    const parsed = QuestionServiceResponseSchema.safeParse(data);
    if (!parsed.success) {
      dispose();
      return;
    }
    const message = parsed.data;
    switch (message.type) {
      case 'done':
        actions.get(message.id)?.resolve();
        actions.delete(message.id);
        break;
      case 'result':
        requests.get(message.id)?.resolve(message.panels);
        break;
      case 'error':
        (requests.get(message.id) ?? actions.get(message.id))?.reject(
          message.code === 'aborted' ? abortError() : new Error('Question service request failed'),
        );
        actions.delete(message.id);
        break;
      case 'status':
        listeners.get(message.id)?.(message.submissions);
        break;
      case 'dispose':
        dispose();
        break;
    }
  };

  function perform(request: ActionRequest): Promise<void> {
    if (disposed) return Promise.reject(abortError());
    const id = nextId++;
    return new Promise((resolve, reject) => {
      actions.set(id, { resolve, reject });
      send({ ...request, id });
    });
  }

  return {
    services: {
      openCopyQuestion: () => perform({ type: 'open-copy-question' }),
      openSubmissionInfo: ({ submissionId }) =>
        perform({ type: 'open-submission-info', submissionId }),
      renderSubmission(request, { signal }) {
        if (disposed || signal.aborted) return Promise.reject(abortError());
        const id = nextId++;
        return new Promise((resolve, reject) => {
          const cleanup = () => {
            signal.removeEventListener('abort', onAbort);
            requests.delete(id);
          };
          const onAbort = () => {
            cleanup();
            reject(abortError());
            send({ type: 'cancel', id });
          };
          requests.set(id, {
            resolve: (panels) => {
              cleanup();
              resolve(panels);
            },
            reject: (error) => {
              cleanup();
              reject(error);
            },
          });
          signal.addEventListener('abort', onAbort, { once: true });
          send({
            type: 'render',
            id,
            submissionId: request.submissionId,
            purpose: request.purpose,
          });
        });
      },
      subscribeToGradingStatus(listener) {
        if (disposed) throw abortError();
        const id = nextId++;
        listeners.set(id, listener);
        send({ type: 'subscribe', id });
        return () => {
          if (listeners.delete(id)) send({ type: 'unsubscribe', id });
        };
      },
      submitAnswer: ({ action, entries }) => perform({ type: 'submit-answer', action, entries }),
      navigate: ({ target }) => perform({ type: 'navigate', target }),
      reportAnswerState({ dirty }) {
        if (!disposed) send({ type: 'answer-state', dirty });
      },
    },
    dispose,
  };
}

/**
 * The application endpoint. Its services are bound to one view by the parent;
 * messages cannot select credentials, endpoints, or a different question view.
 * The owner must dispose this endpoint when that view is replaced, even if the
 * UI never sends a dispose message.
 */
export function serveQuestionServices(
  port: MessagePort,
  host: { services: QuestionBrowserServices; dispose: () => void },
): () => void {
  let disposed = false;
  const requests = new Map<number, AbortController>();
  const subscriptions = new Map<number, () => void>();
  const send = (message: QuestionServiceResponse) => {
    if (!disposed) port.postMessage(message);
  };

  function dispose() {
    if (disposed) return;
    send({ type: 'dispose' });
    disposed = true;
    requests.forEach((controller) => controller.abort());
    requests.clear();
    subscriptions.forEach((unsubscribe) => unsubscribe());
    subscriptions.clear();
    host.dispose();
    port.onmessage = null;
    port.onmessageerror = null;
    port.close();
  }

  async function render(message: Extract<QuestionServiceRequest, { type: 'render' }>) {
    const controller = new AbortController();
    requests.set(message.id, controller);
    try {
      const panels = await host.services.renderSubmission(
        { submissionId: message.submissionId, purpose: message.purpose },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) send({ type: 'result', id: message.id, panels });
    } catch (error) {
      send({
        type: 'error',
        id: message.id,
        code:
          controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
            ? 'aborted'
            : 'failed',
      });
    } finally {
      requests.delete(message.id);
    }
  }

  async function perform(id: number, action: () => Promise<void>) {
    const controller = new AbortController();
    requests.set(id, controller);
    try {
      await action();
      if (!controller.signal.aborted) send({ type: 'done', id });
    } catch (error) {
      send({
        type: 'error',
        id,
        code:
          controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
            ? 'aborted'
            : 'failed',
      });
    } finally {
      requests.delete(id);
    }
  }

  port.onmessageerror = dispose;
  port.onmessage = ({ data }: MessageEvent<unknown>) => {
    const parsed = QuestionServiceRequestSchema.safeParse(data);
    if (!parsed.success) {
      dispose();
      return;
    }
    const message = parsed.data;
    if (
      message.type !== 'cancel' &&
      message.type !== 'unsubscribe' &&
      'id' in message &&
      (requests.has(message.id) || subscriptions.has(message.id))
    ) {
      dispose();
      return;
    }
    switch (message.type) {
      case 'open-copy-question':
        void perform(message.id, () => host.services.openCopyQuestion());
        break;
      case 'open-submission-info':
        void perform(message.id, () =>
          host.services.openSubmissionInfo({ submissionId: message.submissionId }),
        );
        break;
      case 'submit-answer':
        void perform(message.id, () =>
          host.services.submitAnswer({ action: message.action, entries: message.entries }),
        );
        break;
      case 'navigate':
        void perform(message.id, () => host.services.navigate({ target: message.target }));
        break;
      case 'answer-state':
        host.services.reportAnswerState({ dirty: message.dirty });
        break;
      case 'render':
        void render(message);
        break;
      case 'cancel':
        requests.get(message.id)?.abort();
        break;
      case 'subscribe': {
        let active = true;
        try {
          const unsubscribe = host.services.subscribeToGradingStatus((submissions) => {
            if (active) send({ type: 'status', id: message.id, submissions });
          });
          subscriptions.set(message.id, () => {
            active = false;
            unsubscribe();
          });
        } catch {
          dispose();
        }
        break;
      }
      case 'unsubscribe':
        subscriptions.get(message.id)?.();
        subscriptions.delete(message.id);
        break;
      case 'dispose':
        dispose();
        break;
    }
  };
  return dispose;
}
