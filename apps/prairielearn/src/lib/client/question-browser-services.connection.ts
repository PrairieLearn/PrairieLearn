import z from 'zod';

import {
  createQuestionServicesClient,
  serveQuestionServices,
} from './question-browser-services.transport.js';
import type { QuestionBrowserServices } from './question-browser-services.types.js';

const ReadySchema = z.object({
  type: z.literal('question-services-ready'),
  connectionId: z.string(),
});
const ConnectedSchema = z.object({
  type: z.literal('question-services-connected'),
  connectionId: z.string(),
});

/** Install before loading the frame. The page owner disposes this on view replacement. */
export function serveQuestionServicesFrame({
  frame,
  origin,
  createHost,
}: {
  frame: HTMLIFrameElement;
  origin: string;
  createHost: () => { services: QuestionBrowserServices; dispose: () => void };
}): () => void {
  const applicationWindow = frame.ownerDocument.defaultView!;
  // Opaque origins cannot be authenticated by origin. Question frames must use
  // their configured sandbox domain, never a wildcard destination.
  if (new URL(origin).origin !== origin || origin === 'null') {
    throw new Error('Expected an exact frame origin');
  }
  let disposeHost: (() => void) | undefined;
  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== frame.contentWindow || event.origin !== origin || !frame.isConnected) {
      return;
    }
    const parsed = ReadySchema.safeParse(event.data);
    if (!parsed.success) return;
    disposeHost?.();
    const channel = new MessageChannel();
    disposeHost = serveQuestionServices(channel.port1, createHost());
    frame.contentWindow!.postMessage(
      { type: 'question-services-connected', connectionId: parsed.data.connectionId },
      { targetOrigin: origin, transfer: [channel.port2] },
    );
  };
  applicationWindow.addEventListener('message', onMessage);
  return () => {
    applicationWindow.removeEventListener('message', onMessage);
    disposeHost?.();
  };
}

/** The frame calls this with its configured application origin, before using services. */
export function connectQuestionServicesToParent({
  frameWindow,
  origin,
  signal,
}: {
  frameWindow: Window;
  origin: string;
  signal: AbortSignal;
}): Promise<ReturnType<typeof createQuestionServicesClient>> {
  if (new URL(origin).origin !== origin || origin === 'null') {
    throw new Error('Expected an exact application origin');
  }
  signal.throwIfAborted();
  const connectionId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      frameWindow.removeEventListener('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      clearTimeout(timeout);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Question service connection aborted', 'AbortError'));
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frameWindow.parent || event.origin !== origin) return;
      const parsed = ConnectedSchema.safeParse(event.data);
      if (
        !parsed.success ||
        parsed.data.connectionId !== connectionId ||
        event.ports.length !== 1
      ) {
        return;
      }
      cleanup();
      resolve(createQuestionServicesClient(event.ports[0]));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Question service connection timed out'));
    }, 10_000);
    frameWindow.addEventListener('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    frameWindow.parent.postMessage({ type: 'question-services-ready', connectionId }, origin);
  });
}
