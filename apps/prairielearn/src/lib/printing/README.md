# Printing

Tools for creating printable PDFs and editable Word documents, plus a helper that keeps question IDs unique when separate questions share a page.

## Rendering PDFs and Word documents

The browser lays out questions and splits them into pages. PDFs use the finished pages. Word documents use question content saved before page breaks are added, along with images of figures. Create one renderer per application process:

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

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on every server that handles print requests to use Cloudflare Browser Run. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. In production, when `browserOrigin` is provided, the Cloudflare browser loads public files under `config.assetsPrefix` directly from that origin. Other same-origin GET requests are fetched from the application server's local listener and fulfilled through Playwright; the instructor's cookie is sent only to that local listener, never to Cloudflare. Development keeps proxying asset requests so a Cloudflare browser does not need to reach a local server. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Keep scripts enabled when collecting Word content from a fresh preview so the page can save it before pagination.

The browser permits only same-origin `GET` requests during rendering; mutating requests, initial cross-origin requests, service worker, and WebSocket traffic are blocked, and socket.io polling requests are refused as well. Proxied redirects are blocked. Direct public asset requests may follow redirects using the browser's normal behavior, without an instructor cookie. Refusing socket.io polling matters: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve the page's own script and image loads. These restrictions prevent external requests from receiving the forwarded cookie, but they are not a security boundary for course-authored code: same-origin `GET` requests still use the rendering session. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

### Word output

Word documents keep text, lists, tables, answer spaces, links, and equations editable when possible. Images, SVG diagrams, and canvases appear as pictures. Some equations also appear as pictures when no editable version is available.

Word can rearrange pages after edits, so its page count may differ from the PDF. Paper size and margins match the printable page. Details boxes keep their headings and content. Response guidance appears below the answer line, while labels and units stay beside it.

The browser saves question text and equations before it splits them into pages, then captures figures once the page layout is complete. `createDocxDocument` turns that content into an editable Word document. The cover and footer stay editable; callers supply them through `PrintableCover` and `footerLabel`.

`htmlToTextBlocks` turns HTML content, such as assessment instructions, into headings, paragraphs, and simple lists for the cover.

Omit the `cover` option to start with questions on the first page.

## Combining question fragments

Questions are normally rendered in separate documents, so author-generated IDs can repeat between questions. Built-in formula-editor symbolic inputs and sketch inputs generate unique DOM IDs when rendered while keeping their answer names stable. Before combining fragments in a preview or print document, use `namespaceQuestionHtmls` with a stable, unique namespace for each question. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. Custom course elements remain best-effort for printable exams, so preview the output before printing. It namespaces IDs inside each `pl-graph` SVG before checking for duplicate IDs within one fragment. Other duplicate IDs within one fragment, or any duplicate IDs left after namespacing, are rejected.
