# Printing

Utilities for rendering printable HTML as PDFs and editable Word documents, and namespacing question HTML so separately rendered fragments can share a page.

## Rendering PDFs and Word documents

The rendering browser lays out and paginates question HTML. PDF exports use its completed page snapshot. Word exports use the editable source captured before pagination and screenshots of figures. Create one renderer per application process:

```ts
import { closePrintRenderer, getPrintRenderer } from '../printing.js';
import { createDocxOutput } from './docxOutput.js';

const renderer = getPrintRenderer();
const pdf = await renderer.renderPdf({ url: previewUrl, html: paginatedHtml });
const docx = await renderer.render(
  { url: previewUrl, html: paginatedHtml, runScripts: true },
  createDocxOutput({ source, cover, footerLabel }),
);
await closePrintRenderer(); // during shutdown
```

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on chunk servers to use Cloudflare Browser Run. The token needs Browser Run Edit permission. Production servers that are not chunk consumers ignore the credentials; local development can still use them. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The renderer connects over CDP and forwards same-origin asset GET requests from the application server without sending the instructor's cookie to Cloudflare. Local rendering requires a Playwright-compatible Chromium executable.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Word exports enable scripts for their browser-side document builder after validating the static snapshot.

The browser permits only same-origin `GET` requests during rendering; redirects, mutating requests, cross-origin requests, service worker, and WebSocket traffic are blocked, and socket.io polling requests are refused as well. Refusing them matters: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve the page's own script and image loads. This prevents external requests from receiving the forwarded cookie, but it is not a security boundary for course-authored code: same-origin `GET` requests still use the rendering session. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. Set `data-print-paper-size="A4"` on the root element to produce A4 PDF sheets; otherwise, the renderer uses Letter sheets. The page's CSS uses the same attribute to size printable content. `PAPER_SIZES` contains the `Letter` and `A4` values accepted by the PrairieLearn endpoint.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput(pageCode).produce(page)` to reuse the standard PDF output and identification codes.

### Word output

The Word document contains native paragraphs, lists, tables, answer spaces, hyperlinks, and Office Math equations. Only actual figures (images, SVG diagrams, and canvases) are captured as images. Question content is captured before pagination, so Word can reflow edited text and its page count can differ from the PDF. The sheet size and margins follow the printable page's CSS. Printable details boxes retain their heading and content. Response guidance appears below its answer line, with surrounding labels and units kept in separate table cells.

The rendering browser captures normalized HTML and MathML before Paged.js fragments the questions, then screenshots figures after pagination. `docxContent.ts` maps the source to native Word objects, and `printDocxClient.ts` packages the file in that same browser. The cover and footer remain native content built from the caller's `PrintableCover` and `footerLabel`.

`cover` may be a function; it receives the page's root `data-*` attributes so that values which are only known after rendering, such as the number of questions that rendered successfully, can be placed on the cover. `htmlToTextBlocks` reduces author-provided HTML (for example assessment instructions) to headings, paragraphs, and flat lists for the cover.

Omit the `cover` option to start with questions on the first page.

### Page identification codes

`renderPdf` accepts `pageCode: { encodePage(pageNumber) }`. After pagination, it generates a QR code for each physical page, including the cover, using the caller's versioned payload. The template must reserve a bottom-left margin box and enough space for the code and its quiet zone. Browser previews use `addPreviewPageCodes` from `pageCode.ts` to display the same codes before reporting that the document is ready. Each preview has its own timestamp and export UUID; PDF exports replace those codes with their final export identity. The PrairieLearn template reserves 0.7 inches below the content for a 0.35-inch vector code, including its four-module quiet zone. This is about 10% of the original 1.1-inch code's area. The coverage exam's codes decode from 300 and 600 DPI PDF rasterizations, but not at 150 DPI. Physical print-and-scan validation is still needed; longer metadata produces denser codes at the same printed size and should be checked with the intended printer and scanner.

PrairieLearn's `pl:print:1:` payload identifies the course, assessment, assessment instance, one-based physical page, authenticated generating user (ID, UID, and nullable name), UTC generation timestamp, document kind, output format, and a UUID for that export. IDs remain strings to preserve PostgreSQL bigint precision. All pages in one export share its timestamp and UUID. `decodePrintPageIdentity` validates the version and fields for future scanning workflows; decoded metadata is untrusted and does not authenticate the document or authorize database access.

Editable DOCX output currently has no page identification codes. Static codes cannot follow Word repagination, and Word's `DISPLAYBARCODE` field is not supported in Word for Mac. A finalization workflow or an explicitly fixed-page document format is needed before promising physical-page identification in Word.

### PrairieLearn endpoint parameters

The PrairieLearn print endpoint accepts layout choices as query parameters. `block_size` sets the default for every question to `auto`, `third`, `half`, or `full`; it defaults to `auto` when omitted. Repeat `question_block_size=<question-number>:<size>` to override individual questions. Repeat `identity_field=<label>` to add up to six fill-in lines to the cover alongside its built-in Name field. Identity labels are trimmed and may contain up to 40 characters.

`form_label=A` through `form_label=Z` gives an assessment instance a short label on its cover and footers. Omitting it preserves the assessment instance's existing numeric Form ID label.

`include_cover=false` omits the default cover in previews, PDFs, and Word downloads, including answer keys. The default is `true`.

`include_honor_code=true` or `false` controls the student cover pledge independently of the online assessment requirement. Omitting it uses the assessment’s `requireHonorCode` setting. The printed pledge uses the configured `honorCode` when present, with a blank name line for `{{user_name}}`; otherwise it uses the standard pledge.

`grading_table=true` adds blank question scores and a total to student covers. The table uses only included questions and fills down the available cover space before wrapping to another column.

The print preparation page can combine multiple assessment instances and uploaded PDF cover pages into a booklet PDF. Each student copy contains the default cover when enabled, the uploaded PDFs in order, and that instance's questions. Uploaded PDFs still precede the questions when the default cover is disabled. Copies cycle through the selected forms. After all student copies, the booklet appends one answer key per selected form, in form order, even when there are fewer student copies than selected forms. Uploaded covers are included only in the student copies. Generated page numbers and identification codes continue to identify pages within the original form; uploaded pages retain their own appearance and have no generated identification codes.

Automatic blocks are measured at the final printable width after asynchronous question content, MathJax, fonts, and images have settled, then packed in question order. Explicit blocks reserve an exact fraction of the printable content height, including the question's internal spacing, when the content fits. Taller content uses its measured height and moves to the next page or flows across pages when needed.

For example, this gives every question automatic sizing except Questions 2 and 5:

```text
?paper_size=Letter&question_block_size=2:half&question_block_size=5:full
```

This sets a half-page default and allows Question 3 to size itself automatically:

```text
?paper_size=A4&block_size=half&question_block_size=3:auto
```

## Combining question fragments

Questions are normally rendered in separate documents, so author- and element-generated IDs can repeat between questions. Before combining fragments in a preview or print document, use `namespaceQuestionHtmls` with a stable, unique namespace for each question. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts. Formula-editor symbolic inputs and sketch inputs also have their base name and initializer namespaced because their client renderers derive element IDs from those names.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. It rejects duplicate IDs within one fragment and any duplicate IDs left after namespacing.

## Browser transformations

The application owns the browser transforms in `apps/prairielearn/src/lib/client/print-response-controls.ts`; `examPrintingClient.ts` coordinates readiness, answer presentation, and pagination. Transforms run only inside question bodies, after element initialization and before measuring pages.

Generic input placeholders such as "symbolic expression", "integer", and "matrix" do not become printed labels. Preserve custom instructions, useful precision guidance, number bases, and whether a blank answer is allowed. Omit grading tolerances that do not help students fill in the paper response.

| Content                                         | Paper representation                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number, integer, string, units, big-O, symbolic | Empty response lines; preserve labels, suffixes, and useful precision guidance. Replace formula editors rather than copying shadow-root controls.                                                                                                                                                                                                             |
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

An explicit third-, half-, or full-page block reserves that fraction when the question fits. When its content needs more room, reserve its measured height instead; move it to the next page or let it flow across pages when necessary.

When image answer choices make a question taller than its page or selected question block, reduce the choice images by a common scale before pagination. Preserve their proportions and relative sizes, leave fitting images unchanged, and keep question text and answer markers at their original size. If the remaining content cannot fit even without the images, retain the authored image sizes and let the long question flow across pages.

Do not use comma-containing functional selectors such as `:is(h2, h3)` on `break-before` or `break-after` rules. Paged.js splits those selector lists on commas without parsing the function.

Answer keys use the question's authored answer panel. Simple questions retain their prompt; compound answer panels render their authored sections once. Answers stay at a readable font size and may use different page counts from the student document. Never hide overflow or shrink a whole answer panel to fit a short response line.

A successful export does not imply that the author supplied solutions. Manual questions and developer fixtures may have no answer panel, or intentionally contain instructions/debug content in every panel. Printed keys preserve that authored behavior; they do not invent solutions.

### Regression coverage

The browser tests exercise the E23 coverage assessment, legacy questions, rendering failures, and all three exports. They verify static symbolic inputs, visible matrix entries, complete sketch coordinate systems, intact subparts, and unscaled answer panels. DOM tests cover the additional dropdown, matching, file, and rich-text transforms.
