import { setImmediate } from 'node:timers';

import type { ReviewOutcome } from '@prairielearn/course-agent-types';

export function nativeRunner(savedReview?: ReviewOutcome) {
  const submissions: { input: unknown[]; toolOutput?: { output: string } }[] = [];
  const results: ReviewOutcome['result'][] = [];
  const sockets: { emit: (frame: unknown) => void; close: () => void }[] = [];
  let callId = 'review-1';

  const fetch = async () => {
    let closed = false;
    const socket = Object.assign(new EventTarget(), {
      accept() {},
      close() {
        if (closed) return;
        closed = true;
        socket.dispatchEvent(new Event('close'));
      },
      send(text: string) {
        const frame = JSON.parse(text) as {
          id: string | number;
          method?: string;
          params: { input: unknown[]; toolOutput?: { output: string } };
          result?: { contentItems: { text: string }[] };
        };
        switch (frame.method) {
          case 'initialize':
            emit({ id: frame.id, result: {} });
            break;
          case 'thread/start':
          case 'thread/resume':
            emit({ id: frame.id, result: { thread: { id: 'native-thread' } } });
            break;
          case 'thread/read':
            emit({
              id: frame.id,
              result: {
                thread: {
                  turns: [
                    {
                      items: savedReview
                        ? [
                            {
                              type: 'functionCallOutput',
                              name: 'push_sync',
                              output: JSON.stringify(savedReview),
                            },
                          ]
                        : [],
                    },
                  ],
                },
              },
            });
            break;
          case 'turn/start':
            submissions.push(frame.params);
            emit({ id: frame.id, result: { turn: { id: 'turn' } } });
            if (frame.params.toolOutput) {
              finish(JSON.parse(frame.params.toolOutput.output).result);
            }
            break;
          case 'turn/interrupt':
            emit({ id: frame.id, result: {} });
            complete('interrupted');
            break;
          default:
            if (frame.id === callId && frame.result) {
              finish(JSON.parse(frame.result.contentItems[0].text));
            }
        }
      },
    });
    const emit = (frame: unknown) =>
      socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) }));
    const complete = (status = 'completed') =>
      emit({
        method: 'turn/completed',
        params: { threadId: 'native-thread', turn: { id: 'turn', status, error: null } },
      });
    const finish = (result: ReviewOutcome['result']) => {
      results.push(result);
      setImmediate(() => {
        emit({
          method: 'item/agentMessage/delta',
          params: {
            threadId: 'native-thread',
            turnId: 'turn',
            itemId: 'reply',
            delta: `Review ${result.decision}.`,
          },
        });
        complete();
      });
    };
    sockets.push({ emit, close: () => socket.close() });
    return { status: 101, webSocket: socket };
  };

  return {
    fetch,
    submissions,
    results,
    requestReview(id = 'review-1') {
      callId = id;
      sockets.at(-1)!.emit({
        id,
        method: 'item/tool/call',
        params: {
          threadId: 'native-thread',
          turnId: 'turn',
          callId: id,
          tool: 'push_sync',
          namespace: null,
          arguments: {},
        },
      });
    },
    close() {
      sockets.forEach((socket) => socket.close());
    },
  };
}
