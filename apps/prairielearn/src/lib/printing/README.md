# Printing

Tools for creating printable PDFs and editable Word documents, plus a helper that keeps question IDs unique when separate questions share a page.

## Rendering PDFs and Word documents

The browser lays out questions and splits them into pages. PDFs use the finished pages. Word documents use question content saved before page breaks are added, along with images of figures. Create one renderer per application process:

The preview response carries a signed snapshot ID covering its HTML, editable Word source, assessment instance, generating user, layout query, and selected question identities and order. PDF and Word exports verify the ID and current question list before rendering. IDs expire after 24 hours; a changed or expired preview must be refreshed before downloading.

```ts
import { config } from './config.js';
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
const pdf = await renderer.renderPdf({
  url: previewUrl,
  browserOrigin: config.serverCanonicalHost ?? undefined,
  html: paginatedHtml,
  cookieHeader: req.get('cookie'),
});
await renderer.close(); // during shutdown
```

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 50 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 50. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on every server that handles print requests to use Cloudflare Browser Run. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Cloudflare renders require an explicit `browserOrigin`; a missing or empty value fails before connecting to the browser. In production, pass the application's public origin from `config.serverCanonicalHost`. The Cloudflare browser loads public files under `config.assetsPrefix` directly from that origin. Other same-origin GET requests are fetched from the application server's local listener and fulfilled through Playwright; the instructor's cookie is sent only to that local listener, never to Cloudflare.

Cloudflare development also requires `config.serverCanonicalHost` to be configured. The renderer fulfills navigation with the supplied HTML and proxies all assets to the application server, so Cloudflare does not need to reach the local server. Local Chromium ignores `browserOrigin` and uses `url` directly.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Keep scripts enabled when collecting Word content from a fresh preview so the page can save it before pagination.

The browser permits only same-origin `GET` requests during rendering; mutating requests, initial cross-origin requests, service worker, and WebSocket traffic are blocked, and socket.io polling requests are refused as well. Proxied redirects are blocked. Direct public asset requests may follow redirects using the browser's normal behavior, without an instructor cookie. Refusing socket.io polling matters: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve the page's own script and image loads. These restrictions prevent external requests from receiving the forwarded cookie, but they are not a security boundary for course-authored code: same-origin `GET` requests still use the rendering session. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

`assemblePrintPacket()` keeps the original bytes for a single complete document. Combined packets use `pdf-lib` to copy printed pages, sharing fonts and images across repeated copies. Uploaded covers must be readable, unencrypted PDFs within the file, byte, and page limits. Form fields must have saved appearances; otherwise, the cover must be flattened before uploading.

### Word output

Word documents keep text, lists, tables, answer spaces, links, and equations editable when possible. Images, SVG diagrams, and canvases appear as pictures. Some equations also appear as pictures when no editable version is available.

Word can rearrange pages after edits, so its page count may differ from the PDF. Paper size and margins match the printable page. Details boxes keep their headings and content. Response guidance appears below the answer line, while labels and units stay beside it.

The browser saves question text and equations before it splits them into pages, then captures figures once the page layout is complete. `createDocxDocument` turns that content into an editable Word document. The cover and footer stay editable; callers supply them through `PrintableCover` and `footerLabel`.

`cover` may also be a function. It receives the page's root `data-*` attributes, so values known only after rendering, such as the number of questions that rendered successfully, can appear on the cover.

`htmlToTextBlocks` turns HTML content, such as assessment instructions, into headings, paragraphs, and simple lists for the cover, preserving bold, italics, underline, strikethrough, code, subscripts, and superscripts from HTML tags.

Omit the `cover` option to start with questions on the first page.

### PrairieLearn endpoint parameters

`document=assessment` selects the student-facing document and is the default when omitted. Use `document=answer_key` to include correct answers.

The PrairieLearn print endpoint accepts layout choices as query parameters. `block_size` sets the default for every question to `auto`, `third`, `half`, or `full`; it defaults to `auto` when omitted. Repeat `question_block_size=<question-number>:<size>` to override individual questions. Repeat `identity_field=<label>` to add up to six fill-in lines to the cover alongside its built-in Name field. Identity labels are trimmed and may contain up to 40 characters.

`form_label=A` through `form_label=Z` gives an assessment instance a short label on its cover and footers. Omitting it preserves the assessment instance's existing numeric Form ID label.

`include_cover=false` omits the default cover in previews, PDFs, and Word downloads, including answer keys. The default is `true`.

`include_honor_code=true` or `false` controls the student cover pledge independently of the online assessment requirement. Omitting it uses the assessment’s `requireHonorCode` setting. The printed pledge uses the configured `honorCode` when present, with a blank name line for `{{user_name}}`; otherwise it uses the standard pledge.

`grading_table=true` adds blank question scores and a total to student covers. The table uses only included questions and fills down the available cover space before wrapping to another column.

The print preparation page can combine multiple assessment instances and uploaded PDF cover pages into a booklet PDF. Each student copy contains the default cover when enabled, the uploaded PDFs in order, and that instance's questions. Uploaded PDFs still precede the questions when the default cover is disabled. Copies cycle through the selected forms. After all student copies, the booklet appends one answer key per selected form, in form order, even when there are fewer student copies than selected forms. Uploaded covers are included in student copies, including individual form downloads. Answer key downloads exclude uploaded covers. Generated page numbers and identification codes continue to identify pages within the original form; uploaded pages retain their own appearance and have no generated identification codes.

Small packets use the direct PDF response when a render slot is free and the output is at most 15 MB. Larger packets are queued in the shared `jobs` table. The request stores signed page snapshots and encrypted rendering credentials in S3; a cron worker claims up to two exports across all hosts and uploads completed PDFs to S3. Each claim has a renewable lease so another worker can retry it after a process crash. Download links are available to the requesting instructor for 24 hours. Run `processPrintExports` and `cleanPrintExports` cron jobs, and configure Cloudflare rendering on worker hosts.

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

Questions are normally rendered in separate documents, so author-generated IDs can repeat between questions. Built-in formula-editor symbolic inputs and sketch inputs generate unique DOM IDs when rendered while keeping their answer names stable. Before combining fragments in a preview or print document, use `namespaceQuestionHtmls` with a stable, unique namespace for each question. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. Custom course elements remain best-effort for printable assessments, so preview the output before printing. It namespaces IDs inside each `pl-graph` SVG before checking for duplicate IDs within one fragment. Other duplicate IDs within one fragment, or any duplicate IDs left after namespacing, are rejected.
