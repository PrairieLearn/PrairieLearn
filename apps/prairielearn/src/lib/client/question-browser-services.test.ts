// @vitest-environment jsdom
import * as bootstrap from 'bootstrap';
import { io } from 'socket.io-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { withResolvers } from '@prairielearn/utils';

import type { StatusMessage } from '../externalGradingSocket.types.js';
import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionPanels } from '../question-render.types.js';
import type { SubmissionInfo } from '../submission-info.js';

import {
  createLocalQuestionBrowserServices,
  createQuestionServicesHost,
} from './question-browser-services.js';
import { createQuestionSubmissions } from './question-submissions.js';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const panels: SubmissionPanels = {
  submissionPanel: null,
  extraHeadersHtml: null,
  questionScorePanel: '<div id="question-score-panel">80%</div>',
  answerPanel: '<p>Answer</p>',
  questionPanelFooter: '<div id="question-panel-footer">Grade again</div>',
};

const submissionInfo: SubmissionInfo = {
  isAutograded: true,
  id: '2',
  formattedDate: 'November 3, 2026, 10:00:00 AM',
  userUid: 'student@example.com',
  gradingJobId: null,
  gradingJobStats: null,
  gradingJobUrl: null,
};

function createServices(
  dialogData: QuestionDialogData = { copyQuestion: null, submissions: [] },
  submissionRenderUrls = new Map([['2', '/pl/question/1/variant/3/submission/2']]),
) {
  return createQuestionServicesHost({
    document,
    variantId: '3',
    variantToken: 'token',
    csrfToken: 'csrf-token',
    submissionRenderUrls,
    navigationUrls: {
      'new-variant': '/pl/question/1/preview/',
      'try-again': 'https://other.example/pl/question/1/preview/',
    },
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
    'This submission was not automatically graded.',
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
    { submissionId: '2', purpose: 'grading-result' },
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
    csrfToken: 'csrf-token',
    submissionRenderUrls: new Map(),
    navigationUrls: {},
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

it('keeps earlier submission feedback without rolling back shared panels', async () => {
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
  await expect(pending).resolves.toMatchObject({
    submissionPanel: '<div>Earlier submission</div>',
    answerPanel: null,
    questionPanelFooter: null,
  });
  expect(document.getElementById('question-score-panel')!.textContent).toBe('80%');
  dispose();
});

it('merges newer snapshot statuses and jobs while ignoring obsolete acknowledgments', () => {
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
  const graded = { id: '2', grading_job_id: '4', grading_job_status: 'graded' as const };
  const other = { ...graded, id: '5', grading_job_status: 'queued' as const };
  const regraded = { ...other, id: '6' };
  change({ variant_id: '3', submissions: [graded, other, regraded] });
  const completed = { ...graded, id: '5' };
  const newJob = { ...graded, id: '6', grading_job_id: '5' };
  acknowledge({
    variant_id: '3',
    submissions: [{ ...graded, grading_job_status: 'queued' }, completed, newJob],
  });
  expect(listener.mock.calls).toEqual([[[graded, other, regraded]], [[completed, newJob]]]);

  connect();
  acknowledge({ variant_id: '3', submissions: [other] });
  expect(listener).toHaveBeenCalledTimes(2);
  dispose();
});

it('invalidates host renders before cancellation returns across the port', async () => {
  const socket = { on: vi.fn(), emit: vi.fn(), close: vi.fn(), removeAllListeners: vi.fn() };
  vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
  const response = withResolvers<Response>();
  const feedback = { ...panels, submissionPanel: '<div>Replacement feedback</div>' };
  const fetch = vi
    .fn()
    .mockReturnValueOnce(response.promise)
    .mockResolvedValueOnce(Response.json(feedback));
  vi.stubGlobal('fetch', fetch);
  document.body.innerHTML = '<div id="question-score-panel">Original score</div>';
  const client = createLocalQuestionBrowserServices({
    document,
    variantId: '3',
    variantToken: 'token',
    csrfToken: 'csrf-token',
    submissionRenderUrls: new Map([['2', '/submission/2']]),
    navigationUrls: {},
    dialogData: { copyQuestion: null, submissions: [] },
    isCurrent: () => true,
  });
  const queued = { id: '2', grading_job_id: '10', grading_job_status: 'queued' as const };
  const onStatus = vi.fn();
  const onRender = vi.fn();
  const onError = vi.fn();
  const view = createQuestionSubmissions({
    services: client.services,
    submissions: [queued],
    externalGrading: true,
    isCurrent: () => true,
    onStatus,
    onRender,
    onError,
  });
  try {
    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith('change:status', expect.any(Function)),
    );
    const publish = socket.on.mock.calls.find(([event]) => event === 'change:status')![1];
    publish({ variant_id: '3', submissions: [{ ...queued, grading_job_status: 'graded' }] });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const replacement = { ...queued, grading_job_id: '11' };
    publish({ variant_id: '3', submissions: [replacement] });
    // Resolve before the queued status message can reach the UI and cancel the request.
    response.resolve(
      Response.json({
        ...panels,
        questionScorePanel: '<div id="question-score-panel">Stale score</div>',
      }),
    );
    await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith(replacement));
    expect(document.getElementById('question-score-panel')!.textContent).toBe('Original score');
    expect(onRender).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    publish({ variant_id: '3', submissions: [{ ...replacement, grading_job_status: 'graded' }] });
    await vi.waitFor(() =>
      expect(onRender).toHaveBeenCalledExactlyOnceWith('2', {
        submissionPanel: feedback.submissionPanel,
        extraHeadersHtml: feedback.extraHeadersHtml,
        answerPanel: feedback.answerPanel,
        questionPanelFooter: feedback.questionPanelFooter,
      }),
    );
    expect(document.getElementById('question-score-panel')!.textContent).toBe('80%');
    await vi.waitFor(() => expect(socket.close).toHaveBeenCalledOnce());
  } finally {
    view.dispose();
    client.dispose();
  }
});

it('submits answers once with application credentials and warns only about unsaved answers', async () => {
  document.body.innerHTML = '<div class="question-container"></div>';
  const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
  const { services, dispose } = createServices();
  const leave = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  services.reportAnswerState({ dirty: true });
  expect(leave()).toBe(true);
  services.reportAnswerState({ dirty: false });
  expect(leave()).toBe(false);

  await expect(
    services.submitAnswer({ action: 'grade', entries: [['__csrf_token', 'question-token']] }),
  ).rejects.toThrow('reserved fields');
  services.reportAnswerState({ dirty: true });
  await services.submitAnswer({
    action: 'grade',
    entries: [
      ['answer', '1'],
      ['answer', '2'],
    ],
  });
  expect(submit).toHaveBeenCalledOnce();
  const form = submit.mock.contexts[0] as HTMLFormElement;
  expect(form.closest('.question-container')).toBeNull();
  expect(form.method).toBe('post');
  expect(form.getAttribute('action')).toBeNull();
  expect(Array.from(new FormData(form))).toEqual([
    ['__csrf_token', 'csrf-token'],
    ['__variant_id', '3'],
    ['__action', 'grade'],
    ['answer', '1'],
    ['answer', '2'],
  ]);
  expect(leave()).toBe(false);
  await expect(services.submitAnswer({ action: 'save', entries: [] })).rejects.toThrow(
    'already submitted',
  );
  expect(submit).toHaveBeenCalledOnce();
  dispose();
});

it('stops warning about unsaved answers when the view is disposed', () => {
  const { services, dispose } = createServices();
  services.reportAnswerState({ dirty: true });
  dispose();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});

it('navigates only to application-provided same-origin URLs', async () => {
  const { services, dispose } = createServices();
  await expect(services.navigate({ target: 'manual-grading-preview' })).rejects.toThrow(
    'Navigation is unavailable',
  );
  await expect(services.navigate({ target: 'try-again' })).rejects.toThrow('same-origin');
  dispose();
});
