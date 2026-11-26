# Printing

Tools for creating printable PDFs and editable Word documents, plus a helper that keeps question IDs unique when separate questions share a page.

## Rendering PDFs and Word documents

The browser lays out questions and splits them into pages. PDFs use the finished pages. Word documents use question content saved before page breaks are added, along with images of figures. Create one renderer per application process:

```ts
import { config } from './config.js';
import { createPdfOutput } from './printing/pdf-output.js';
import { PrintRenderer } from './printing/print-renderer.js';

const renderer = new PrintRenderer({
  cloudflare:
    config.printingCloudflareAccountId && config.printingCloudflareApiToken
      ? {
          accountId: config.printingCloudflareAccountId,
          apiToken: config.printingCloudflareApiToken,
        }
      : undefined,
});
const pdf = await renderer.render(
  {
    url: previewUrl,
    browserOrigin: config.serverCanonicalHost ?? undefined,
    html: paginatedHtml,
    assetScope,
  },
  createPdfOutput(),
);
await renderer.close(); // during shutdown
```

The preview response carries a signed snapshot ID covering its HTML, editable Word source, saved print form, generating user, layout query, and selected question identities and order. Export requests verify the ID and current question list; the export worker loads the submitted pages in the browser and compares their normalized HTML with the signed digest before rendering, so the check doesn't block the Node event loop. IDs expire after 24 hours; a changed or expired preview must be refreshed before downloading.

Build `assetScope` from the already authorized course instance, assessment, saved print form, selected print-form question IDs, and user IDs. The renderer uses it to mint a credential for that render.

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait. Preview HTTP requests share a 45-second deadline across question preparation and rendering, including time in the render queue. PDF and Word requests enqueue background exports; each render in an export has its own 45-second deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on every server that handles print requests to use Cloudflare Browser Run. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Cloudflare renders require an explicit `browserOrigin`; a missing or empty value fails before connecting to the browser. In production, pass the application's public origin from `config.serverCanonicalHost`, so the Cloudflare browser can load public files under `config.assetsPrefix` directly from that origin. Protected assets are fetched from the application server's local listener and fulfilled through Playwright.

Cloudflare development also requires `config.serverCanonicalHost` to be configured. The renderer fulfills navigation with the supplied HTML and proxies all assets to the application server, so Cloudflare does not need to reach the local server. Local Chromium ignores `browserOrigin` and uses `url` directly.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Keep scripts enabled when collecting Word content from a fresh preview so the page can save it before pagination.

For each render with `assetScope`, the renderer issues a five-minute, job-specific asset credential. It permits only public assets and protected asset paths for that print form and its selected print-form questions. It sends the credential to the local asset routes, never to the rendering browser. Other same-origin routes, proxied redirects, mutating requests, cross-origin requests, service workers, WebSockets, and socket.io polling are blocked. Direct public asset requests may follow redirects using the browser's normal behavior, without a credential. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size.

For outputs that also need metadata from the paginated page, pass a custom `PrintablePageOutput` instead. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

`assemblePrintPacket()` keeps the original bytes for a single complete document. Combined packets use `pdf-lib` to copy each selected form once and add blank pages after shorter forms so every form has the same number of pages. Uploaded covers must be readable, unencrypted PDFs within the file, byte, and page limits. Form fields must have saved appearances; otherwise, the cover must be flattened before uploading.

### Word output

Word documents keep text, lists, tables, answer spaces, links, and equations editable when possible. Images, SVG diagrams, and canvases appear as pictures. Some equations also appear as pictures when no editable version is available.

Word can rearrange pages after edits, so its page count may differ from the PDF. Paper size and margins match the printable page. Details boxes keep their headings and content. Response guidance appears below the answer line, while labels and units stay beside it.

The browser saves question text and equations before it splits them into pages, then captures figures once the page layout is complete. `createDocxDocument` turns that content into an editable Word document. The cover and footer stay editable; callers supply them separately through `PrintableCover` and `footer`.

`cover` may also be a function. It receives the page's root `data-*` attributes, so values known only after rendering, such as the number of questions that rendered successfully, can appear on the cover.

`htmlToTextBlocks` turns HTML content, such as assessment instructions, into headings, paragraphs, and simple lists for the cover, preserving bold, italics, underline, strikethrough, code, subscripts, and superscripts from HTML tags.

Omit the `cover` option to start with questions on the first page.

### PrairieLearn endpoint parameters

Form A1 is created automatically when a course editor first opens the print preparation view for an assessment with questions. Forms store a permanent label, selected questions, order, point values, floating variants, and print settings such as paper size, default cover options, question exclusions, and spacing. Regenerating an unlocked form replaces its variants in place while retaining its label, question rows, and settings. Once an export is queued, the form is locked; regeneration then archives it and creates the next numbered version of its letter, such as A2. The replacement inherits the form's print settings but resets question exclusions and individual spacing; archived versions remain available. Reading a preview reuses saved variants; it does not create student assessment instances or change a student's work.

The form resource is `/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/print_form/:print_form_id`. Its `/preview` endpoint renders HTML, and `/docx` queues a Word export from a submitted page snapshot and returns `{printExportId}`. `/docx` accepts only `document` as a query parameter and uses the form's saved print settings. Course staff with preview permission can inspect any form for the assessment, including archived forms. Creating or changing forms and starting PDF or Word exports require Course Editor permission.

`document=assessment` selects the student-facing document and is the default when omitted. Use `document=answer_key` to include correct answers.

The preview endpoint accepts layout choices as query parameters. PDF and Word exports always use the form's saved settings, so their snapshots must come from a preview rendered with those settings. `block_size` sets the default for every question to `auto`, `third`, `half`, or `full`; it defaults to `auto` when omitted. Repeat `question_block_size=<question-number>:<size>` to override individual questions. Repeat `identity_field=<label>` to add up to six fill-in lines to the cover alongside its built-in Name field. Identity labels are trimmed and may contain up to 40 characters.

The form's saved label appears on covers and footers. New forms use the first available letter from `A` through `Z` and start at version `1`; up to 26 forms can be active. Archiving a slot makes its letter available to the next added form, which receives the next numbered version (for example, `C2`). Any active form can be archived while another active form remains. Query parameters cannot change labels.

`include_cover=false` omits the default cover in previews, PDFs, and Word downloads, including answer keys. The default is `true`.

`include_honor_code=true` or `false` controls the student cover pledge independently of the online assessment requirement. Omitting it uses the assessment’s `requireHonorCode` setting. The printed pledge uses the configured `honorCode` when present, with a blank name line for `{{user_name}}`; otherwise it uses the default honor code.

`grading_table=true` adds blank question scores and a total to student covers. The table uses only included questions and fills down the available cover space before wrapping to another column.

The print preparation page can combine all current student forms into one PDF, or all current answer keys into another. Each student form contains the default cover when enabled, the uploaded PDFs in order, and that form's questions. Uploaded PDFs still precede the questions when the default cover is disabled and are included in individual form downloads. Answer key downloads exclude uploaded covers. Shorter forms or answer keys receive blank pages at the end so each form in a combined PDF occupies the same number of pages. Generated page numbers remain within the original form; uploaded pages retain their own appearance.

PDF and Word exports are queued. Each export is a row in `print_exports`, which records its status and result; its input is stored in S3, and its ID is published to PrairieMQ for dispatch. If the publication fails, the export is marked failed and the request returns an error. Each user can have at most five exports in progress per assessment. Exports are grouped by course so courses take turns, and total throughput scales with the number of workers. Workers run on hosts with `printExportWorkerActive` and a browser renderer (local Chromium or Cloudflare). PrairieMQ retries a run interrupted by a graceful shutdown on another worker and recovers crashed runs as stalls; an export that runs out of retries is marked failed. An export still pending after 30 minutes, e.g. because Redis lost its job, reads as failed. Downloads are available to the requesting user for up to 24 hours after the export is queued. The app doesn't delete export files: configure an S3 lifecycle rule on the `print-exports/` prefix that also expires noncurrent versions. PrairieMQ requires a non-clustered Redis without eviction through `nonVolatileRedisUrl`. The queue namespace defaults to a hash of the PostgreSQL host and database, so deployments sharing a Redis stay separate; set `printExportQueuePrefix` when hosts use different aliases for the same database.

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

Questions are normally rendered in separate documents, so author-generated IDs can repeat between questions. Before combining fragments in a preview or print document, call `namespaceQuestionHtmls` with a stable, unique namespace for each question and await its result. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. Custom course elements remain best-effort for printable assessments, so preview the output before printing. It namespaces IDs repeated within a fragment inside each inline SVG and rewrites references inside that SVG. References outside an SVG to an ID repeated within the fragment remain ambiguous. Other duplicate IDs within one fragment, or any duplicate IDs left after namespacing, are rejected.
