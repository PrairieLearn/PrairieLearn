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

## Rendering PDFs and Word documents

`PrintRenderer` turns a paginated printable page into a PDF (`renderPdf`) or a Word document
(`renderDocx`). Create one renderer per process and keep it for the life of the process:

```ts
import { PrintRenderer } from '@prairielearn/printing';

const renderer = new PrintRenderer({ browserWSEndpoint: config.printingPlaywrightWsEndpoint });
const pdf = await renderer.renderPdf({ url: previewUrl, cookieHeader: req.get('cookie') });
const docx = await renderer.renderDocx({ url: previewUrl, cookieHeader, cover, footerLabel });
await renderer.close(); // during shutdown
```

The renderer launches one headless Chromium on first use and reuses it for every later render, so
browser memory stays roughly constant no matter how many people print at once. Renders run one at a
time; additional requests wait in a bounded queue (`maxQueuedRenders`, default 16) and fail
immediately once it is full. Each render gets its own short-lived browser context so cookies never
leak between requests. One deadline (`timeoutMs`, default 120 seconds) covers queueing, page
preparation, pagination, and output; a timed-out render has its context closed in the background,
and a context that does not close within `contextCloseGraceMs` takes the whole browser with it. A
browser that crashes or disconnects is relaunched on the next render, and `close()` rejects queued
renders and shuts the browser down.

Set `browserWSEndpoint` to connect to a Playwright browser server instead of launching Chromium
locally; the server and package Playwright versions must match. Remote endpoints should be private
and accessible only to the PrairieLearn application because they grant browser-control access. The
remote connection exposes the caller's loopback interface so that an application-local print URL
remains reachable from a browser running in another container. Without an endpoint, a
Playwright-compatible Chromium executable must be installed locally (for example, with
`pnpm playwright install chromium`).

The browser permits only same-origin `GET` requests during rendering; mutating, cross-origin,
service worker, and WebSocket traffic is blocked, and socket.io polling requests are refused as
well. Refusing them matters: with WebSockets closed, socket.io would otherwise fall back to HTTP
long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve
the page's own script and image loads. This prevents external requests from receiving
the forwarded cookie, but it is not a security boundary for course-authored code: same-origin
`GET` requests still use the rendering session. Cross-origin question assets must be served through
PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set
`document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error`
with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative
for the physical paper size; `PAPER_SIZES` contains the `Letter` and `A4` values accepted by the
PrairieLearn endpoint.

### Word output

The Word document keeps the cover page and the running footer as native content built from the
caller's `PrintableCover` and `footerLabel`. Every `.printing-question` element inside a
`.pagedjs_page` becomes one image captured at twice the CSS resolution, and a page break starts
each subsequent printed page so the document paginates like the PDF. Instructors can edit the
cover, reorder questions, and add space between them, but question content itself is not editable
text. The sheet size and margins are measured from the paginated page, so they follow the page's
CSS.

`cover` may be a function; it receives the page's root `data-*` attributes so that values which
are only known after rendering, such as the number of questions that rendered successfully, can be
placed on the cover. `htmlToTextBlocks` reduces author-provided HTML (for example assessment
instructions) to headings, paragraphs, and flat lists for the cover.

### PrairieLearn endpoint parameters

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

## Browser transformations

The application owns the browser transforms in `apps/prairielearn/src/lib/client/print-response-controls.ts`; `examPrintingClient.ts` coordinates readiness, answer presentation, and pagination. Transforms run only inside question bodies, after element initialization and before measuring pages.

Generic input placeholders such as "symbolic expression", "integer", and "matrix" do not become printed labels. Preserve custom placeholder instructions and answer requirements, including precision, tolerance, number bases, and whether a blank answer is allowed.

| Content                                         | Paper representation                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number, integer, string, units, big-O, symbolic | Empty response lines; preserve labels, suffixes, and tolerance hints. Replace formula editors rather than copying shadow-root controls.                                                                                                                                                                                                                       |
| Matrix entries                                  | One line per entry in the original row/column structure.                                                                                                                                                                                                                                                                                                      |
| Radio and checkbox choices                      | Unchecked, high-contrast markers with aligned labels, generous vertical spacing, and light option separators.                                                                                                                                                                                              |
| Dropdown and matching                           | Visible option lists and response lines; retain a matching option bank even when the dropdown originally contained the only copy.                                                                                                                                                                                                                             |
| Ordering                                        | Blank order-number boxes beside every option and provided block, with boxed "Choose only one block from this group" sets. Tell students to leave unused blocks blank. When indentation is graded, add an Indent box (0 = no indentation) beside the Order box instead of asking students to copy the solution. Label multiple block sets within one question. |
| File, rich text, workspace                      | Written response space; preserve file names, starter code, and rich-text word-count requirements.                                                                                                                                                                                                                                                             |
| Image capture                                   | One blank work area per capture, without camera, crop, or upload controls.                                                                                                                                                                                                                                                                                    |
| Sketch                                          | Static SVG with its original coordinate system and a responsive viewBox.                                                                                                                                                                                                                                                                                      |
| Drawing, Excalidraw, PrairieDraw                | Preserve the initialized drawing and remove interactive tools; snapshot canvases before pagination.                                                                                                                                                                                                                                                           |
| Variable output                                 | The initially selected language as a static labeled panel.                                                                                                                                                                                                                                                                                                    |
| Embedded media                                  | A printable source reference. The author must supply a paper alternative when playing media is necessary to answer.                                                                                                                                                                                                                                           |
| Custom and content-only questions               | Preserve authored content and provide a generic response area when there are no response controls.                                                                                                                                                                                                                                                            |

Attributions embedded in a question are arbitrary authored HTML, not reliably distinguishable metadata. Preserve them; do not remove paragraphs by guessing from words such as "source" or "Wikipedia".

### Pagination and answer keys

Long questions start on a fresh page. Subparts that fit on one page receive explicit page boundaries when necessary: Paged.js does not reliably honor nested `break-inside: avoid` rules for all cards and SVGs. Keep the same content width for measurement, HTML, PDF, and DOCX capture.

Do not use comma-containing functional selectors such as `:is(h2, h3)` on `break-before` or `break-after` rules. Paged.js splits those selector lists on commas without parsing the function.

Answer keys use the question's authored answer panel. Simple questions retain their prompt; compound answer panels render their authored sections once. Answers stay at a readable font size and may use different page counts from the student document. Never hide overflow or shrink a whole answer panel to fit a short response line.

A successful export does not imply that the author supplied solutions. Manual questions and developer fixtures may have no answer panel, or intentionally contain instructions/debug content in every panel. Printed keys preserve that authored behavior; they do not invent solutions.

### Regression coverage

The browser tests exercise the E23 coverage assessment, legacy questions, rendering failures, and all three exports. They verify static symbolic inputs, visible matrix entries, complete sketch coordinate systems, intact subparts, and unscaled answer panels. DOM tests cover the additional dropdown, matching, file, and rich-text transforms.
