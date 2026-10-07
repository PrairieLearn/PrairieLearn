# Printing

Utilities for rendering printable HTML as PDFs and namespacing question HTML so separately rendered fragments can share a page.

## Rendering PDFs

`PrintRenderer` turns a paginated printable page into a PDF (`renderPdf`). Create one renderer per process and keep it for the life of the process. For example, from a caller in `src/lib`:

```ts
import { PrintRenderer } from './printing/printRenderer.js';

const renderer = new PrintRenderer({
  cloudflare: {
    accountId: config.printingCloudflareAccountId,
    apiToken: config.printingCloudflareApiToken,
  },
});
const pdf = await renderer.renderPdf({
  url: previewUrl,
  html: paginatedHtml,
  cookieHeader: req.get('cookie'),
});
await renderer.close(); // during shutdown
```

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set `printingCloudflareAccountId` and `printingCloudflareApiToken` to use Cloudflare Browser Run. The token needs Browser Run Edit permission. The renderer connects over CDP and forwards same-origin asset GET requests from the application server without sending the instructor's cookie to Cloudflare. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Word exports enable scripts for their browser-side document builder after validating the static snapshot.

The browser permits only same-origin `GET` requests during rendering; redirects, mutating requests, cross-origin requests, service worker, and WebSocket traffic are blocked, and socket.io polling requests are refused as well. Refusing them matters: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve the page's own script and image loads. This prevents external requests from receiving the forwarded cookie, but it is not a security boundary for course-authored code: same-origin `GET` requests still use the rendering session. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size; `PAPER_SIZES` contains the `Letter` and `A4` values accepted by the printing code.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

## Combining question fragments

Questions are normally rendered in separate documents, so author- and element-generated IDs can repeat between questions. Before combining fragments in a preview or print document, use `namespaceQuestionHtmls` with a stable, unique namespace for each question. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts. Formula-editor symbolic inputs and sketch inputs also have their base name and initializer namespaced because their client renderers derive element IDs from those names.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. It rejects duplicate IDs within one fragment and any duplicate IDs left after namespacing.
