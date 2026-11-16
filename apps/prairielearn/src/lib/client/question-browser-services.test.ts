// @vitest-environment jsdom
import * as bootstrap from 'bootstrap';
import { io } from 'socket.io-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { withResolvers } from '@prairielearn/utils';

import type { StatusMessage } from '../externalGradingSocket.types.js';
import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionPanels } from '../question-render.types.js';
import type { SubmissionInfo } from '../submission-info.js';

import { createQuestionServicesHost } from './question-browser-services.js';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const panels: SubmissionPanels = {
  submissionPanel: null,
  extraHeadersHtml: null,
  questionScorePanel: '<div id="question-score-panel">80%</div>',
  answerPanel: '<p>Answer</p>',
  questionPanelFooter: '<div id="question-panel-footer">Grade again</div>',
};

const submissionInfo: SubmissionInfo = {
  id: '2',
  formattedDate: 'November 3, 2026, 10:00:00 AM',
  userUid: 'student@example.com',
  gradingJobId: null,
  gradingJobStats: null,
  gradingJobUrl: null,
};

function createServices(
  dialogData: QuestionDialogData,
  submissionRenderUrls = new Map([['2', '/pl/question/1/variant/3/submission/2']]),
) {
  return createQuestionServicesHost({
    document,
    variantId: '3',
    variantToken: 'token',
    submissionRenderUrls,
    dialogData,
    isCurrent: () => true,
  });
}

beforeEach(() => {
  vi.stubGlobal('bootstrap', bootstrap);
});

afterEach(() => {
  document
    .querySelectorAll('.modal')
    .forEach((element) => bootstrap.Modal.getInstance(element)?.hide());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('opens the application copy form and keeps destination credentials paired', async () => {
  document.body.innerHTML = '<div class="question-container"></div>';
  const { services, dispose } = createServices({
    submissions: [],
    copyQuestion: {
      courseId: '1',
      questionId: '7',
      targets: [
        {
          id: '4',
          short_name: 'Course A',
          copy_url: '/pl/course/4/copy_public_question',
          __csrf_token: 'token-a',
        },
        {
          id: '5',
          short_name: 'Course B',
          copy_url: '/pl/course/5/copy_public_question',
          __csrf_token: 'token-b',
        },
      ],
    },
  });
  const closed = services.openCopyQuestion();
  const repeated = services.openCopyQuestion();
  expect(document.querySelectorAll('.modal')).toHaveLength(1);
  expect(document.querySelector('.question-container .modal')).toBeNull();
  const form = document.querySelector<HTMLFormElement>('.js-copy-question-form')!;
  const destination = form.querySelector<HTMLSelectElement>('[name="to_course_id"]')!;
  destination.value = '5';
  destination.dispatchEvent(new Event('change'));
  expect(form.getAttribute('action')).toBe('/pl/course/5/copy_public_question');
  expect(form.querySelector<HTMLInputElement>('[name="__csrf_token"]')!.value).toBe('token-b');

  form.querySelector<HTMLButtonElement>('[data-bs-dismiss="modal"]')!.click();
  await Promise.all([closed, repeated]);
  expect(document.querySelector('.modal')).toBeNull();
  expect(document.querySelector('.modal-backdrop')).toBeNull();
  dispose();
});

it('updates an open submission dialog from server data without returning that data to the question', async () => {
  const { services, dispose } = createServices({
    copyQuestion: null,
    submissions: [submissionInfo],
  });
  const closed = services.openSubmissionInfo({ submissionId: '2' });
  expect(document.querySelector('.modal-body')!.textContent).toContain(
    'This submission has not been graded.',
  );

  const gradedInfo: SubmissionInfo = {
    ...submissionInfo,
    gradingJobId: '8',
    gradingJobUrl: '/pl/course/1/grading_job/8',
    gradingJobStats: {
      grading_method: 'External',
      submitDuration: '1s',
      queueDuration: '2s',
      prepareDuration: '3s',
      runDuration: '4s',
      reportDuration: '5s',
      totalDuration: '15s',
      phases: [6.6, 13.3, 20, 26.6, 33.3],
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ...panels, submissionInfo: gradedInfo })),
  );
  const result = await services.renderSubmission(
    { submissionId: '2', purpose: 'grading-result' },
    { signal: new AbortController().signal },
  );
  expect(result).not.toHaveProperty('submissionInfo');
  expect(document.querySelector('.modal-body')!.textContent).toContain('15s');
  expect(document.querySelector('.modal-body a')!.getAttribute('href')).toBe(
    '/pl/course/1/grading_job/8',
  );

  document.querySelector<HTMLAnchorElement>('.modal-body a')!.focus();
  await services.renderSubmission(
    { submissionId: '2', purpose: 'grading-result' },
    { signal: new AbortController().signal },
  );
  expect(document.activeElement).toBe(document.querySelector('.modal-body a'));
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  await closed;
  expect(document.querySelector('.modal')).toBeNull();

  const reopened = services.openSubmissionInfo({ submissionId: '2' });
  dispose();
  await reopened;
  expect(document.querySelector('.modal-backdrop')).toBeNull();
  expect(document.body.classList.contains('modal-open')).toBe(false);
});

it('discards submission responses received after the view is disposed', async () => {
  const response = withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => response.promise),
  );
  document.body.innerHTML = '<div id="question-score-panel">Original score</div>';
  const { services, dispose } = createServices({
    copyQuestion: null,
    submissions: [submissionInfo],
  });
  const pending = services.renderSubmission(
    { submissionId: '2', purpose: 'history' },
    { signal: new AbortController().signal },
  );
  dispose();
  response.resolve(
    Response.json({
      ...panels,
      submissionInfo,
      questionScorePanel: '<div id="question-score-panel">Stale score</div>',
    }),
  );
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(document.getElementById('question-score-panel')!.textContent).toBe('Original score');
});

it('shares one grading socket and its latest status until the last subscriber leaves', () => {
  const socket = { on: vi.fn(), emit: vi.fn(), close: vi.fn(), removeAllListeners: vi.fn() };
  vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
  const host = createQuestionServicesHost({
    document,
    dialogData: { copyQuestion: null, submissions: [] },
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
    expect(vi.mocked(io)).toHaveBeenCalledTimes(1);
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
    vi.clearAllMocks();
  }
});

it('discards an older render of the same submission before updating scores', async () => {
  const old = withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(Response.json(panels)),
  );
  document.body.innerHTML = '<div id="question-score-panel">0%</div>';
  const { services, dispose } = createServices({
    copyQuestion: null,
    submissions: [submissionInfo],
  });
  const request = { submissionId: '2', purpose: 'grading-result' as const };
  const options = { signal: new AbortController().signal };
  const pending = services.renderSubmission(request, options);
  await services.renderSubmission(request, options);
  old.resolve(
    Response.json({
      ...panels,
      questionScorePanel: '<div id="question-score-panel">Old score</div>',
    }),
  );
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(document.getElementById('question-score-panel')!.textContent).toBe('80%');
  dispose();
});

it('keeps feedback for different submissions without letting late responses roll back shared panels', async () => {
  const old = withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(Response.json(panels)),
  );
  document.body.innerHTML = '<div id="question-score-panel">0%</div>';
  const { services, dispose } = createServices(
    { copyQuestion: null, submissions: [] },
    new Map([
      ['1', '/submission/1'],
      ['2', '/submission/2'],
    ]),
  );
  const options = { signal: new AbortController().signal };
  const pending = services.renderSubmission(
    { submissionId: '1', purpose: 'grading-result' },
    options,
  );
  await services.renderSubmission({ submissionId: '2', purpose: 'grading-result' }, options);
  old.resolve(
    Response.json({
      ...panels,
      submissionPanel: '<div>Earlier submission</div>',
      questionScorePanel: '<div id="question-score-panel">Old score</div>',
    }),
  );
  const result = await pending;
  expect(result.submissionPanel).toBe('<div>Earlier submission</div>');
  expect(result.answerPanel).toBeNull();
  expect(result.questionPanelFooter).toBeNull();
  expect(document.getElementById('question-score-panel')!.textContent).toBe('80%');
  dispose();
});

it.each(['4', '5'])(
  'merges snapshot job %s with live statuses and ignores obsolete acknowledgments',
  (snapshotJobId) => {
    const socket = {
      on: vi.fn<(event: string, listener: unknown) => void>(),
      emit: vi.fn<
        (
          event: string,
          message: unknown,
          acknowledge: (message: StatusMessage | null) => void,
        ) => void
      >(),
      removeAllListeners: vi.fn(),
      close: vi.fn(),
    };
    vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
    const { services, dispose } = createServices({ copyQuestion: null, submissions: [] });
    const listener = vi.fn();
    services.subscribeToGradingStatus(listener);
    const connect = socket.on.mock.calls.find(([event]) => event === 'connect')![1] as () => void;
    const change = socket.on.mock.calls.find(([event]) => event === 'change:status')![1] as (
      message: StatusMessage,
    ) => void;
    connect();
    const acknowledge = socket.emit.mock.calls[0][2];
    acknowledge(null);
    expect(listener).not.toHaveBeenCalled();
    const graded = { id: '2', grading_job_id: '4', grading_job_status: 'graded' as const };
    const other = { ...graded, id: '5', grading_job_status: 'queued' as const };
    change({ variant_id: '3', submissions: [graded, other] });
    const completed = { ...graded, id: '5', grading_job_id: snapshotJobId };
    acknowledge({
      variant_id: '3',
      submissions: [{ ...graded, grading_job_status: 'queued' }, completed],
    });
    expect(listener.mock.calls).toEqual([[[graded, other]], [[completed]]]);

    connect();
    acknowledge({ variant_id: '3', submissions: [other] });
    expect(listener).toHaveBeenCalledTimes(2);
    dispose();
    socket.emit.mock.calls[1][2]({ variant_id: '3', submissions: [graded] });
    change({ variant_id: '3', submissions: [graded] });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
  },
);
