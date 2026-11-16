import { afterEach, expect, it, vi } from 'vitest';

import type { StatusMessageSubmission } from '../externalGradingSocket.types.js';

import {
  createQuestionServicesClient,
  serveQuestionServices,
} from './question-browser-services.transport.js';
import type {
  QuestionBrowserServices,
  QuestionContentPanels,
} from './question-browser-services.types.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function connect(services: QuestionBrowserServices) {
  const channel = new MessageChannel();
  const host = { services, dispose: vi.fn() };
  const disposeHost = serveQuestionServices(channel.port1, host);
  const client = createQuestionServicesClient(channel.port2);
  cleanups.push(client.dispose, disposeHost);
  return { ...client, host, disposeHost };
}

function deferredPanels() {
  let resolve!: (panels: QuestionContentPanels) => void;
  const promise = new Promise<QuestionContentPanels>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const panels = (text: string): QuestionContentPanels => ({
  submissionPanel: text,
  extraHeadersHtml: null,
});

it('matches concurrent responses to requests across real ports and propagates failures', async () => {
  const first = deferredPanels();
  const second = deferredPanels();
  const renderSubmission = vi
    .fn<QuestionBrowserServices['renderSubmission']>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockRejectedValueOnce(new Error('Internal details'))
    .mockRejectedValueOnce(new DOMException('Question view was removed', 'AbortError'));
  const { services } = connect({ renderSubmission, subscribeToGradingStatus: () => () => {} });
  const options = { signal: new AbortController().signal };
  const a = services.renderSubmission({ submissionId: '1', purpose: 'history' }, options);
  const b = services.renderSubmission({ submissionId: '2', purpose: 'grading-result' }, options);
  await vi.waitFor(() => expect(renderSubmission).toHaveBeenCalledTimes(2));
  second.resolve(panels('second'));
  expect(await b).toEqual(panels('second'));
  first.resolve(panels('first'));
  expect(await a).toEqual(panels('first'));
  await expect(
    services.renderSubmission({ submissionId: '3', purpose: 'history' }, options),
  ).rejects.toThrow('Failed to fetch submission');
  await expect(
    services.renderSubmission({ submissionId: '4', purpose: 'history' }, options),
  ).rejects.toMatchObject({ name: 'AbortError' });
});

it('rejects cancellation locally and aborts host work', async () => {
  const result = deferredPanels();
  const renderSubmission = vi
    .fn<QuestionBrowserServices['renderSubmission']>()
    .mockReturnValue(result.promise);
  const { services } = connect({ renderSubmission, subscribeToGradingStatus: () => () => {} });
  const controller = new AbortController();
  const pending = services.renderSubmission(
    { submissionId: '1', purpose: 'history' },
    { signal: controller.signal },
  );
  const rejected = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(renderSubmission).toHaveBeenCalledOnce());
  controller.abort();
  expect(await rejected).toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(renderSubmission.mock.calls[0][1].signal.aborted).toBe(true));
  result.resolve(panels('late'));
});

it('delivers initial status, unsubscribes, and rejects pending work when the host disposes', async () => {
  const unsubscribe = vi.fn();
  let publish!: (submissions: StatusMessageSubmission[]) => void;
  const renderSubmission = vi.fn<QuestionBrowserServices['renderSubmission']>(
    () => new Promise(() => {}),
  );
  const { services, disposeHost, host } = connect({
    renderSubmission,
    subscribeToGradingStatus(listener) {
      publish = listener;
      listener([]);
      return unsubscribe;
    },
  });
  const listener = vi.fn();
  const stop = services.subscribeToGradingStatus(listener);
  await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
  stop();
  await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  publish([]);
  const pending = services.renderSubmission(
    { submissionId: '1', purpose: 'history' },
    { signal: new AbortController().signal },
  );
  const rejected = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(renderSubmission).toHaveBeenCalledOnce());
  disposeHost();
  expect(await rejected).toMatchObject({ name: 'AbortError' });
  expect(listener).toHaveBeenCalledOnce();
  expect(renderSubmission.mock.calls[0][1].signal.aborted).toBe(true);
  expect(host.dispose).toHaveBeenCalledOnce();
});
