// @vitest-environment jsdom
import * as bootstrap from 'bootstrap';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionPanels } from '../question-render.types.js';
import type { SubmissionInfo } from '../submission-info.js';

import { createQuestionServicesHost } from './question-browser-services.js';

const panels: SubmissionPanels = {
  submissionPanel: '<div id="submission-2">Feedback</div>',
  extraHeadersHtml: '<script src="/question.js"></script>',
  answerPanel: '<p>Answer</p>',
  questionPanelFooter: '<div id="question-panel-footer">Grade again</div>',
  questionScorePanel: '<div id="question-score-panel">80%</div>',
  assessmentScorePanel: '<div id="assessment-score-panel">50%</div>',
  questionNavNextButton: '<div id="question-nav-next-container">Next</div>',
};

const submissionInfo: SubmissionInfo = {
  id: '2',
  formattedDate: 'November 3, 2026, 10:00:00 AM',
  userUid: 'student@example.com',
  gradingJobId: null,
  gradingJobStats: null,
  gradingJobUrl: null,
};

function createServices(dialogData: QuestionDialogData) {
  return createQuestionServicesHost({
    document,
    variantId: '3',
    variantToken: 'token',
    submissionRenderUrls: new Map([['2', '/pl/question/1/variant/3/submission/2']]),
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
  expect(form.querySelector<HTMLInputElement>('[name="question_id"]')!.value).toBe('7');
  expect(form.querySelector<HTMLInputElement>('[name="course_id"]')!.value).toBe('1');

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
  await expect(services.openSubmissionInfo({ submissionId: '99' })).rejects.toThrow(
    'Unknown submission',
  );
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
  await expect(services.openSubmissionInfo({ submissionId: '2' })).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('discards submission responses received after the view is disposed', async () => {
  let respond!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    ),
  );
  const { services, dispose } = createServices({
    copyQuestion: null,
    submissions: [submissionInfo],
  });
  const pending = services.renderSubmission(
    { submissionId: '2', purpose: 'history' },
    { signal: new AbortController().signal },
  );
  dispose();
  respond(Response.json({ ...panels, submissionInfo }));
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(document.querySelector('.modal')).toBeNull();
});

const mocks = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));

it('shares one grading socket and its latest status until the last subscriber leaves', () => {
  const socket = { on: vi.fn(), emit: vi.fn(), close: vi.fn(), removeAllListeners: vi.fn() };
  mocks.io.mockReturnValue(socket);
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
    vi.clearAllMocks();
  }
});
