# Printing

Tools for creating printable PDFs and editable Word documents, plus a helper that keeps question IDs unique when separate questions share a page.

## Rendering PDFs and Word documents

The browser lays out questions and splits them into pages. PDFs use the finished pages. Word documents use question content saved before page breaks are added, along with images of figures. Create one renderer per application process:

The preview response carries a signed snapshot ID covering its HTML, editable Word source, saved print form, generating user, layout query, and selected question identities and order. PDF and Word exports verify the ID and current question list before rendering. IDs expire after 24 hours; a changed or expired preview must be refreshed before downloading.

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
  assetScope,
});
await renderer.close(); // during shutdown
```

Build `assetScope` from the already authorized course instance, assessment, saved print form, selected print-form question IDs, and user IDs. The renderer uses it to mint a credential for that render.

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait. HTTP print requests share a 45-second deadline across question preparation, queueing, and rendering. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on every server that handles print requests to use Cloudflare Browser Run. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Cloudflare renders require an explicit `browserOrigin`; a missing or empty value fails before connecting to the browser. In production, pass the application's public origin from `config.serverCanonicalHost`. The Cloudflare browser loads public files under `config.assetsPrefix` directly from that origin. Protected assets are fetched from the application server's local listener and fulfilled through Playwright.

Cloudflare development also requires `config.serverCanonicalHost` to be configured. Use a public HTTPS origin such as `https://example.com`, as in the Cloudflare browser test, rather than `localhost` or a loopback address: the remote browser can reject local navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The renderer fulfills navigation with the supplied HTML and proxies all assets to the application server, so this origin does not need to host your development server and no public tunnel is required. Keep the local application listening on its usual port. Local Chromium ignores `browserOrigin` and uses `url` directly.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Keep scripts enabled when collecting Word content from a fresh preview so the page can save it before pagination.

For each render with `assetScope`, the renderer issues a five-minute, job-specific asset credential. It permits only public assets and protected asset paths for that print form and its selected print-form questions. It sends the credential to the local asset routes, never to the rendering browser. Other same-origin routes, proxied redirects, mutating requests, cross-origin requests, service workers, WebSockets, and socket.io polling are blocked. Direct public asset requests may follow redirects using the browser's normal behavior, without a credential. Cross-origin question assets must be served through PrairieLearn to appear in the output.

AI grading shares the renderer with `purpose: 'ai_grading'` and an assessment-instance scope containing selected instance-question IDs. These credentials permit instance-question assets instead of print-form assets and require Enterprise access rather than the printing feature flag. Generated files must belong to a variant of the scoped instance question; AI grading does not create print forms.

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

Forms are created explicitly and store their selected questions, order, point values, and floating variants. Reading a preview reuses those saved variants; it does not create student assessment instances or change a student's work.

The form resource is `/pl/course_instance/:course_instance_id/instructor/assessment/:assessment_id/print_form/:print_form_id`. Its `/preview` endpoint renders HTML, and `/docx` queues a Word export from a submitted page snapshot and returns `{jobSequenceId}`. Access requires course preview permission and ownership by the effective user.

`document=assessment` selects the student-facing document and is the default when omitted. Use `document=answer_key` to include correct answers.

The PrairieLearn print endpoint accepts layout choices as query parameters. `block_size` sets the default for every question to `auto`, `third`, `half`, or `full`; it defaults to `auto` when omitted. Repeat `question_block_size=<question-number>:<size>` to override individual questions. Repeat `identity_field=<label>` to add up to six fill-in lines to the cover alongside its built-in Name field. Identity labels are trimmed and may contain up to 40 characters.

`form_label=A` through `form_label=Z` gives a saved print form a short label on its cover and footers. Omitting it preserves the print form's numeric Form ID label.

`include_cover=false` omits the default cover in previews, PDFs, and Word downloads, including answer keys. The default is `true`.

`include_honor_code=true` or `false` controls the student cover pledge independently of the online assessment requirement. Omitting it uses the assessment’s `requireHonorCode` setting. The printed pledge uses the configured `honorCode` when present, with a blank name line for `{{user_name}}`; otherwise it uses the standard pledge.

`grading_table=true` adds blank question scores and a total to student covers. The table uses only included questions and fills down the available cover space before wrapping to another column.

The print preparation page can combine multiple saved print forms and uploaded PDF cover pages into a booklet PDF. Each student copy contains the default cover when enabled, the uploaded PDFs in order, and that form's questions. Uploaded PDFs still precede the questions when the default cover is disabled. Copies cycle through the selected forms. After all student copies, the booklet appends one answer key per selected form, in form order, even when there are fewer student copies than selected forms. Uploaded covers are included in student copies, including individual form downloads. Answer key downloads exclude uploaded covers. Generated page numbers remain within the original form; uploaded pages retain their own appearance.

PDF and Word exports are accepted in the shared `jobs` table, including individual forms and small packets. The request validates signed page snapshots, stores export inputs in S3, and publishes the job ID to PrairieMQ. Workers share a limit of two active exports across all hosts. PostgreSQL retains status, results, and an attempt counter; `processPrintExports` reconciles pending jobs whose Redis publication was lost. Workers use an ownership token to prevent an older attempt from publishing over its replacement. Configure a non-evicting Redis instance through `nonVolatileRedisUrl`. The queue namespace defaults to a hash of the PostgreSQL host and database, keeping separate deployments isolated even when Redis is shared. Hosts that use different aliases for the same database must configure the same `printExportQueuePrefix`. Download links are available to the requesting instructor for 24 hours; keep `cleanPrintExports` enabled and configure Cloudflare rendering on worker hosts.

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
