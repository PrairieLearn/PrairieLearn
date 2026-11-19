import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';

import { createQuestionServicesHost } from './question-browser-services.js';

const mocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));

it('shares one grading socket and its latest status until the last subscriber leaves', () => {
  const socket = { on: vi.fn(), emit: vi.fn(), close: vi.fn(), removeAllListeners: vi.fn() };
  mocks.io.mockReturnValue(socket);
  const dom = new JSDOM('');
  const host = createQuestionServicesHost({
    document: dom.window.document,
    variantId: '1',
    variantToken: 'token',
    submissionRenderUrls: new Map(),
    isCurrent: () => true,
  });
  try {
    const first = vi.fn();
    const stopFirst = host.services.subscribeToGradingStatus(first);
    const publish = socket.on.mock.calls.find(([event]) => event === 'change:status')![1];
    const submissions = [
      { id: '2', grading_job_id: '3', grading_job_status: 'grading' },
      { id: '4', grading_job_id: '5', grading_job_status: 'queued' },
    ];
    publish({ variant_id: '1', submissions });
    const graded = { ...submissions[0], grading_job_status: 'graded' };
    publish({ variant_id: '1', submissions: [graded] });
    const second = vi.fn();
    const stopSecond = host.services.subscribeToGradingStatus(second);
    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith([graded, submissions[1]]);

    stopFirst();
    expect(socket.close).not.toHaveBeenCalled();
    publish({ variant_id: '1', submissions: [] });
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenLastCalledWith([]);

    stopSecond();
    expect(socket.close).toHaveBeenCalledTimes(1);
  } finally {
    host.dispose();
    dom.window.close();
    vi.clearAllMocks();
  }
});
