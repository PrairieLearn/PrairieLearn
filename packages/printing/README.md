# `@prairielearn/printing`

Utilities for preparing PrairieLearn assessments for paper-oriented output. The package is
currently private and deliberately does not depend on the PrairieLearn application: callers supply
an adapter for creating an assessment instance, obtaining its ordered questions, determining each
question type, and rendering each question to HTML.

## Rendering assessment questions

`renderAssessmentQuestions` creates a fresh assessment instance for every call. It processes the
instance's questions serially and returns their HTML in the order supplied by `getQuestions`.
`renderAssessmentInstanceQuestions` runs the same rendering and transformation pipeline against an
existing assessment instance.

```ts
import { renderAssessmentQuestions } from '@prairielearn/printing';

const html = await renderAssessmentQuestions({
  assessment,
  adapter: {
    createFreshAssessmentInstance: (assessment) => createInstance(assessment),
    getQuestions: (assessmentInstance, assessment) =>
      selectQuestions(assessmentInstance, assessment),
    getQuestionType: (question, assessmentInstance, assessment) =>
      getQuestionType(question, assessmentInstance, assessment),
    renderQuestion: (question, assessmentInstance, assessment) =>
      renderQuestion(question, assessmentInstance, assessment),
  },
  questionTransformers: new Map([
    ['MultipleChoice', ({ html }) => `<section class="multiple-choice-print">${html}</section>`],
  ]),
  defaultQuestionTransformer: ({ html }) => html,
});
```

All adapter callbacks and transformers may return either their value directly or a promise. A
transformer registered for the exact value returned by `getQuestionType` takes precedence over the
default transformer. If neither exists, the rendered HTML is returned unchanged.

Each transformer receives the assessment, assessment instance, question, question type,
zero-based question index, and rendered HTML. This keeps type-specific print markup separate from
the application-specific rendering adapter.

### Reporting questions that cannot be rendered

Use `renderAssessmentQuestionsReport` or `renderAssessmentInstanceQuestionsReport` when a caller
needs to keep rendering after a known question-level failure. These helpers return the assessment
instance and an ordered `questionResults` array. Each result is either a `rendered` result containing
the transformed HTML or a `failed` result containing the question, its original index, the pipeline
stage, and application-defined failure metadata.

Failures must be explicitly classified by the adapter. The classifier returns safe, structured
metadata for a known error and returns `undefined` for everything else:

```ts
import { renderAssessmentInstanceQuestionsReport } from '@prairielearn/printing';

class BrokenQuestionError extends Error {}

const report = await renderAssessmentInstanceQuestionsReport({
  assessment,
  assessmentInstance,
  adapter: {
    getQuestions,
    getQuestionType,
    renderQuestion,
    classifyQuestionError: (error) =>
      error instanceof BrokenQuestionError
        ? { code: 'broken-question', message: 'Question could not be rendered' }
        : undefined,
  },
});

const printableHtml = report.questionResults
  .filter((result) => result.status === 'rendered')
  .map((result) => result.html);
```

An absent classifier or an `undefined` classification rethrows the original error, as do failures
while creating the assessment instance or obtaining its question list. This keeps database,
browser, and other infrastructure failures from being mistaken for broken questions. The original
error is not stored in the report, so applications should include only information suitable for
the eventual response in their classified metadata. The existing `renderAssessmentQuestions` and
`renderAssessmentInstanceQuestions` HTML-array helpers remain fail-fast even if their adapter has a
classifier.

## Rendering PDFs

`renderUrlToPdf` uses Playwright's headless Chromium, waits for the page to report that its Paged.js
layout is ready, and returns the resulting PDF buffer. The page's CSS `@page` rule is authoritative
for the physical paper size; `PAPER_SIZES` contains the `Letter` and `A4` values accepted by the
PrairieLearn endpoint. By default the helper launches Chromium locally. Set `browserWSEndpoint` to
connect to a Playwright browser server instead; the server and package Playwright versions must
match. Remote endpoints should be private and accessible only to the PrairieLearn application
because they grant browser-control access. The remote connection exposes the caller's loopback
interface so that an application-local print URL remains reachable from a browser running in
another container.

The browser permits only same-origin `GET` requests during rendering; mutating, cross-origin,
service worker, and WebSocket traffic is blocked. This prevents external requests from receiving
the forwarded cookie, but it is not a security boundary for course-authored code: same-origin
`GET` requests still use the rendering session. Cross-origin question assets must be served through
PrairieLearn to appear in the PDF.

Each application process runs at most two PDF renders concurrently and queues at most four more.
Additional renders fail immediately. Queue time counts against the caller's timeout, which also
bounds browser startup, page preparation, and PDF generation. A timed-out render closes its browser
so that the next queued render can proceed.

The caller owns the paginated HTML page. It must set
`document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error`
with a `data-print-error` message if pagination fails. A Playwright-compatible Chromium executable
must be installed locally (for example, with `pnpm playwright install chromium`) unless
`browserWSEndpoint` is set.

The PrairieLearn print endpoint accepts layout choices as query parameters. `block_size` sets the
default for every question to `auto`, `third`, `half`, or `full`; it defaults to `auto` when
omitted. Repeat `question_block_size=<question-number>:<size>` to override individual questions.
Repeat `identity_field=<label>` to add up to six fill-in lines to the cover alongside its built-in
Name field. Identity labels are trimmed and may contain up to 40 characters.
Automatic blocks are measured at the final printable width after asynchronous question content,
MathJax, fonts, and images have settled, then packed in question order. Explicit blocks reserve an
exact fraction of the printable content height, including the question's internal spacing. If a
question's content is taller than its requested block, pagination fails with an error instead of
clipping the question.

For example, this gives every question automatic sizing except Questions 2 and 5:

```text
?paper_size=Letter&question_block_size=2:half&question_block_size=5:full
```

This sets a half-page default and allows Question 3 to size itself automatically:

```text
?paper_size=A4&block_size=half&question_block_size=3:auto
```

## Combining question fragments

Questions are normally rendered in separate documents, so author- and element-generated IDs can
repeat between questions. Before combining fragments in a preview or print document, use
`namespaceQuestionHtmls` with a stable, unique namespace for each question. It updates duplicate IDs
and their standard HTML references. Formula-editor symbolic inputs and sketch inputs also have their
base name and initializer namespaced because their client renderers derive element IDs from those
names.
