import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';

import {
  connectQuestionServicesToParent,
  serveQuestionServicesFrame,
} from './question-browser-services.connection.js';

it('checks the frame origin and source before connecting ports in a simulated handshake', async () => {
  const dom = new JSDOM('<iframe></iframe>', { url: 'https://app.example' });
  const frame = dom.window.document.querySelector('iframe')!;
  const frameWindow = frame.contentWindow!;
  const host = {
    services: {
      renderSubmission: vi
        .fn()
        .mockResolvedValue({ submissionPanel: 'feedback', extraHeadersHtml: null }),
      subscribeToGradingStatus: vi.fn(),
    },
    dispose: vi.fn(),
  };
  const createHost = vi.fn(() => host);
  const sendToFrame = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => {});
  const sendToParent = vi.spyOn(dom.window, 'postMessage').mockImplementation(() => {});
  const dispose = serveQuestionServicesFrame({
    frame,
    origin: 'https://question.example',
    createHost,
  });
  const controller = new AbortController();
  const connected = connectQuestionServicesToParent({
    frameWindow,
    origin: 'https://app.example',
    signal: controller.signal,
  });
  const ready = sendToParent.mock.calls[0][0];
  const deliverReady = (origin: string, source: Window | null) =>
    dom.window.dispatchEvent(
      new dom.window.MessageEvent('message', { data: ready, origin, source }),
    );
  try {
    deliverReady('https://other.example', frameWindow);
    deliverReady('https://question.example', null);
    expect(createHost).not.toHaveBeenCalled();
    deliverReady('https://question.example', frameWindow);
    expect(createHost).toHaveBeenCalledOnce();
    const [data, options] = sendToFrame.mock.calls[0];
    expect(options!.targetOrigin).toBe('https://question.example');
    // The browser handles delivery and transfer in production. Here we deliver
    // the handshake explicitly while retaining real MessagePorts for service traffic.
    frameWindow.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data,
        origin: 'https://app.example',
        source: frameWindow.parent,
        ports: options!.transfer as MessagePort[],
      }),
    );
    const client = await connected;
    try {
      const result = await client.services.renderSubmission(
        { submissionId: '1', purpose: 'history' },
        { signal: controller.signal },
      );
      expect(result.submissionPanel).toBe('feedback');
    } finally {
      client.dispose();
    }
  } finally {
    controller.abort();
    dispose();
    sendToFrame.mockRestore();
    sendToParent.mockRestore();
    dom.window.close();
  }
  expect(host.dispose).toHaveBeenCalledOnce();
});
