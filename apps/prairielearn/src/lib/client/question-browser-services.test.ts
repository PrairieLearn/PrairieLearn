import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';

import type { SubmissionPanels } from '../question-render.types.js';

import { createLocalQuestionBrowserServices } from './question-browser-services.js';

const panels: SubmissionPanels = {
  submissionPanel: '<div id="submission-2">Feedback</div>',
  extraHeadersHtml: '<script src="/question.js"></script>',
  answerPanel: '<p>Answer</p>',
  questionPanelFooter: '<div id="question-panel-footer">Grade again</div>',
  questionScorePanel: '<div id="question-score-panel">80%</div>',
  assessmentScorePanel: '<div id="assessment-score-panel">50%</div>',
  questionNavNextButton: '<div id="question-nav-next-container">Next</div>',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps application panels out of the question response', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(panels));
  vi.stubGlobal('fetch', fetch);
  const document = new JSDOM(
    `<div id="question-score-panel">0%</div>
     <div id="assessment-score-panel">0%</div>
     <div id="question-nav-next-container"></div>`,
    { url: 'https://pl.example/pl/question/1' },
  ).window.document;
  const { services, dispose } = createLocalQuestionBrowserServices({
    document,
    variantId: '3',
    variantToken: 'token',
    submissionRenderUrls: new Map([
      ['2', '/pl/question/1/variant/3/submission/2?manual_grading_preview=true'],
    ]),
    isCurrent: () => true,
  });

  const result = await services.renderSubmission(
    { submissionId: '2', purpose: 'grading-result' },
    { signal: new AbortController().signal },
  );

  expect(document.getElementById('question-score-panel')!.textContent).toBe('80%');
  expect(document.getElementById('assessment-score-panel')!.textContent).toBe('50%');
  expect(document.getElementById('question-nav-next-container')!.textContent).toBe('Next');
  expect(result).toEqual({
    submissionPanel: panels.submissionPanel,
    extraHeadersHtml: panels.extraHeadersHtml,
    answerPanel: panels.answerPanel,
    questionPanelFooter: panels.questionPanelFooter,
  });

  dispose();
});
