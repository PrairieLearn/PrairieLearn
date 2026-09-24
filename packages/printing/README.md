# `@prairielearn/printing`

Utilities for rendering printable HTML as PDFs and editable Word documents. The PrairieLearn
application loads and renders assessment questions; this package handles document output and
namespacing question HTML so the fragments can share a page.

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
printing package.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)`
with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call
`createPdfOutput().produce(page)` to reuse the standard PDF output.

### Word output

The Word document contains native paragraphs, lists, tables, answer spaces, hyperlinks, and
Office Math equations. Only actual figures (images, SVG diagrams, and canvases) are captured as
images. Question content is captured before pagination, so Word can reflow edited text and its
page count can differ from the PDF. The sheet size and margins follow the printable page's CSS.

The renderer installs optional browser hooks to retain MathML before print transforms clone
typeset equations, then captures normalized HTML before Paged.js fragments the questions.
`docxBrowser.ts` owns that capture; `docxContent.ts` maps it to native Word objects. The cover and
footer remain native content built from the caller's `PrintableCover` and `footerLabel`.

`cover` may be a function; it receives the page's root `data-*` attributes so that values which
are only known after rendering, such as the number of questions that rendered successfully, can be
placed on the cover. `htmlToTextBlocks` reduces author-provided HTML (for example assessment
instructions) to headings, paragraphs, and flat lists for the cover.

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
| Radio and checkbox choices                      | Unchecked, high-contrast markers with aligned labels, generous vertical spacing, and light option separators. Word keeps each option in a separate editable row.                                                                                                                                                                                              |
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

When image answer choices make a question taller than its page or selected question block, reduce the choice images by a common scale before pagination. Preserve their proportions and relative sizes, leave fitting images unchanged, and keep question text and answer markers at their original size. If the remaining content cannot fit even without the images, retain the authored image sizes and apply the usual long-question layout or block-size error.

Do not use comma-containing functional selectors such as `:is(h2, h3)` on `break-before` or `break-after` rules. Paged.js splits those selector lists on commas without parsing the function.

Answer keys use the question's authored answer panel. Simple questions retain their prompt; compound answer panels render their authored sections once. Answers stay at a readable font size and may use different page counts from the student document. Never hide overflow or shrink a whole answer panel to fit a short response line.

A successful export does not imply that the author supplied solutions. Manual questions and developer fixtures may have no answer panel, or intentionally contain instructions/debug content in every panel. Printed keys preserve that authored behavior; they do not invent solutions.
