# Printing

Utilities for rendering printable HTML as PDFs and namespacing question HTML so separately rendered fragments can share a page.

## Rendering PDFs

`PrintRenderer` turns a paginated printable page into a PDF (`renderPdf`). Create one renderer per process and keep it for the life of the process. For example, from a caller in `src/lib`:

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

Build `assetScope` from the already authorized course instance, assessment, assessment instance, selected instance question IDs, and user IDs. The renderer uses it to mint a credential for that render.

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on every server that handles print requests to use Cloudflare Browser Run. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Cloudflare renders require an explicit `browserOrigin`; a missing or empty value fails before connecting to the browser. In production, pass the application's public origin from `config.serverCanonicalHost`. The Cloudflare browser loads public files under `config.assetsPrefix` directly from that origin. Protected assets are fetched from the application server's local listener and fulfilled through Playwright.

Cloudflare development also requires `config.serverCanonicalHost` to be configured. The renderer fulfills navigation with the supplied HTML and proxies all assets to the application server, so Cloudflare does not need to reach the local server. Local Chromium ignores `browserOrigin` and uses `url` directly.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Word exports enable scripts for their browser-side document builder after validating the static snapshot.

For each render with `assetScope`, the renderer issues a five-minute, job-specific asset credential. It permits only public assets and protected asset paths for that assessment instance and its selected instance questions. It sends the credential to the local asset routes, never to the rendering browser. Other same-origin routes, proxied redirects, mutating requests, cross-origin requests, service workers, WebSockets, and socket.io polling are blocked. Direct public asset requests may follow redirects using the browser's normal behavior, without a credential. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

## Combining question fragments

Questions are normally rendered in separate documents, so author-generated IDs can repeat between questions. Built-in formula-editor symbolic inputs and sketch inputs generate unique DOM IDs when rendered while keeping their answer names stable. Before combining fragments in a preview or print document, use `namespaceQuestionHtmls` with a stable, unique namespace for each question. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. Custom course elements remain best-effort for printable exams, so preview the output before printing. It namespaces IDs repeated within a fragment inside each inline SVG and rewrites references inside that SVG. References outside an SVG to an ID repeated within the fragment remain ambiguous. Other duplicate IDs within one fragment, or any duplicate IDs left after namespacing, are rejected.
