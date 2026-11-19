import { expect, it, vi } from 'vitest';

import { withResolvers } from '@prairielearn/utils';

import type { StatusMessageSubmission } from '../externalGradingSocket.types.js';

import type {
  QuestionBrowserServices,
  QuestionContentPanels,
} from './question-browser-services.types.js';
import { createQuestionSubmissions } from './question-submissions.js';

function setup(submissions: StatusMessageSubmission[]) {
  let notify!: (updates: StatusMessageSubmission[]) => void;
  const unsubscribe = vi.fn();
  const render = vi.fn<QuestionBrowserServices['renderSubmission']>();
  const services: QuestionBrowserServices = {
    openCopyQuestion: vi.fn(),
    openSubmissionInfo: vi.fn(),
    renderSubmission: render,
    subscribeToGradingStatus: (listener) => {
      notify = listener;
      return unsubscribe;
    },
    submitAnswer: vi.fn(),
    navigate: vi.fn(),
    reportAnswerState: vi.fn(),
  };
  const onStatus = vi.fn();
  const onRender = vi.fn();
  const onError = vi.fn();
  const view = createQuestionSubmissions({
    services,
    submissions,
    externalGrading: true,
    isCurrent: () => true,
    onStatus,
    onRender,
    onError,
  });
  return { view, onStatus, notify, unsubscribe, render, onRender, onError };
}

const queued: StatusMessageSubmission = {
  id: '1',
  grading_job_id: '10',
  grading_job_status: 'queued',
};
const feedback: QuestionContentPanels = {
  submissionPanel: '<div>Feedback</div>',
  extraHeadersHtml: '',
};

it('supersedes history with grading, deduplicates updates, and waits for all pending submissions', async () => {
  const second = { ...queued, id: '2', grading_job_id: '11' };
  const { view, notify, unsubscribe, render, onRender } = setup([queued, second]);
  const result = withResolvers<QuestionContentPanels>();
  render.mockReturnValueOnce(new Promise(() => {})).mockReturnValueOnce(result.promise);

  view.loadHistory('1');
  view.loadHistory('1');
  expect(render).toHaveBeenCalledTimes(1);
  const historySignal = render.mock.calls[0][1].signal;
  const graded = { ...queued, grading_job_status: 'graded' as const };
  notify([graded]);
  notify([graded]);
  view.loadHistory('1');
  expect(historySignal.aborted).toBe(true);
  expect(render).toHaveBeenCalledTimes(2);
  expect(render.mock.calls[1][0]).toEqual({ submissionId: '1', purpose: 'grading-result' });

  result.resolve(feedback);
  await vi.waitFor(() => expect(onRender).toHaveBeenCalledExactlyOnceWith('1', feedback));
  expect(unsubscribe).not.toHaveBeenCalled();

  notify([{ ...second, grading_job_status: 'canceled' }]);
  expect(unsubscribe).toHaveBeenCalledOnce();
  view.dispose();
});

it('retries grading with score panels despite stale statuses', async () => {
  const { view, notify, unsubscribe, render, onError, onRender, onStatus } = setup([queued]);
  render.mockRejectedValueOnce(new Error('Network failure')).mockResolvedValueOnce(feedback);
  const graded = { ...queued, grading_job_id: '12', grading_job_status: 'graded' as const };
  notify([graded]);
  notify([{ ...graded, grading_job_status: 'grading' }]);
  notify([queued]);
  notify([{ ...queued, grading_job_id: undefined, grading_job_status: 'none' }]);
  expect(onStatus).toHaveBeenLastCalledWith(graded);
  expect(render.mock.calls[0][1].signal.aborted).toBe(false);
  await vi.waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith('1'));
  expect(unsubscribe).not.toHaveBeenCalled();

  view.loadHistory('1');
  await vi.waitFor(() => expect(onRender).toHaveBeenCalledExactlyOnceWith('1', feedback));
  expect(render.mock.calls[1][0].purpose).toBe('grading-result');
  expect(unsubscribe).toHaveBeenCalledOnce();
  view.dispose();
});

it('restarts requested history when its job changes even if the new job is canceled', async () => {
  const { view, notify, render, onRender } = setup([queued]);
  const current = withResolvers<QuestionContentPanels>();
  render.mockReturnValueOnce(new Promise(() => {})).mockReturnValueOnce(current.promise);
  view.loadHistory('1');
  notify([{ ...queued, grading_job_id: '11' }]);
  expect(render.mock.calls[0][1].signal.aborted).toBe(true);
  expect(render.mock.calls[1][0]).toEqual({ submissionId: '1', purpose: 'history' });
  notify([{ ...queued, grading_job_id: '11', grading_job_status: 'canceled' }]);
  current.resolve(feedback);
  await vi.waitFor(() => expect(onRender).toHaveBeenCalledExactlyOnceWith('1', feedback));
  view.dispose();
});
