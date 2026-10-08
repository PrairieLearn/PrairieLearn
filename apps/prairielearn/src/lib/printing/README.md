# Printing

Utilities for rendering printable HTML as PDFs and namespacing question HTML so separately rendered fragments can share a page.

## Rendering PDFs

`PrintRenderer` turns a paginated printable page into a PDF (`renderPdf`). Create one renderer per process and keep it for the life of the process. For example, from a caller in `src/lib`:

```ts
import { getPrintingCloudflareConfig } from './config.js';
import { PrintRenderer } from './printing/printRenderer.js';

const renderer = new PrintRenderer({
  cloudflare: getPrintingCloudflareConfig(),
});
const pdf = await renderer.renderPdf({
  url: previewUrl,
  html: paginatedHtml,
  cookieHeader: req.get('cookie'),
});
await renderer.close(); // during shutdown
```

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on chunk servers to use Cloudflare Browser Run. Production servers that are not chunk consumers ignore the credentials; local development can still use them. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. The renderer connects over CDP and forwards same-origin asset GET requests from the application server without sending the instructor's cookie to Cloudflare. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Word exports enable scripts for their browser-side document builder after validating the static snapshot.

The browser permits only same-origin `GET` requests during rendering; redirects, mutating requests, cross-origin requests, service worker, and WebSocket traffic are blocked, and socket.io polling requests are refused as well. Refusing them matters: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve the page's own script and image loads. This prevents external requests from receiving the forwarded cookie, but it is not a security boundary for course-authored code: same-origin `GET` requests still use the rendering session. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

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
| Radio and checkbox choices                      | Unchecked, high-contrast markers with aligned labels, generous vertical spacing, and light option separators.                                                                                                                                                                                                                                                 |
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

Long questions start on a fresh page. Subparts that fit on one page receive explicit page boundaries when necessary: Paged.js does not reliably honor nested `break-inside: avoid` rules for all cards and SVGs. Keep the same content width for measurement, HTML and PDF.

An explicit third-, half-, or full-page block reserves that fraction when the question fits. When its content needs more room, reserve its measured height instead; move it to the next page or let it flow across pages when necessary.

When image answer choices make a question taller than its page or selected question block, reduce the choice images by a common scale before pagination. Preserve their proportions and relative sizes, leave fitting images unchanged, and keep question text and answer markers at their original size. If the remaining content cannot fit even without the images, retain the authored image sizes and let the long question flow across pages.

Do not use comma-containing functional selectors such as `:is(h2, h3)` on `break-before` or `break-after` rules. Paged.js splits those selector lists on commas without parsing the function.

Answer keys use the question's authored answer panel. Simple questions retain their prompt; compound answer panels render their authored sections once. Answers stay at a readable font size and may use different page counts from the student document. Never hide overflow or shrink a whole answer panel to fit a short response line.

A successful export does not imply that the author supplied solutions. Manual questions and developer fixtures may have no answer panel, or intentionally contain instructions/debug content in every panel. Printed keys preserve that authored behavior; they do not invent solutions.
