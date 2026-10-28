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
  cookieHeader: req.get('cookie'),
});
await renderer.close(); // during shutdown
```

The renderer connects to one Cloudflare browser on first use and runs up to four independent contexts concurrently. Another 64 requests may wait, bounded by the 120-second end-to-end deadline. Local development uses one Chromium render at a time and a queue of 16. Set `maxConcurrentRenders` or `maxQueuedRenders` to override those limits. Each render has its own short-lived context. A browser that disconnects is reconnected on the next render, and `close()` rejects queued renders and closes the browser.

Set both `printingCloudflareAccountId` and `printingCloudflareApiToken` on every server that handles print requests to use Cloudflare Browser Run. If both are unset, the renderer uses local Chromium. A missing or empty value in either setting is a configuration error. The token needs Browser Run Edit permission. Without Cloudflare credentials, a Playwright-compatible Chromium executable must be installed locally for development and tests.

Cloudflare renders require an explicit `browserOrigin`; a missing or empty value fails before connecting to the browser. In production, pass the application's public origin from `config.serverCanonicalHost`. The Cloudflare browser loads public files under `config.assetsPrefix` directly from that origin. Other same-origin GET requests are fetched from the application server's local listener and fulfilled through Playwright; the instructor's cookie is sent only to that local listener, never to Cloudflare.

Cloudflare development also requires `config.serverCanonicalHost` to be configured. The renderer fulfills navigation with the supplied HTML and proxies all assets to the application server, so Cloudflare does not need to reach the local server. Local Chromium ignores `browserOrigin` and uses `url` directly.

Set `runScripts: true` when preparing a fresh preview from server-generated question HTML. PDF exports use the completed, script-free page snapshot with scripts disabled. Word exports enable scripts for their browser-side document builder after validating the static snapshot.

The browser permits only same-origin `GET` requests during rendering; mutating requests, initial cross-origin requests, service worker, and WebSocket traffic are blocked, and socket.io polling requests are refused as well. Proxied redirects are blocked. Direct public asset requests may follow redirects using the browser's normal behavior, without an instructor cookie. Refusing socket.io polling matters: with WebSockets closed, socket.io would otherwise fall back to HTTP long-polling, and a few open polls can occupy every HTTP/1.1 connection to the server and starve the page's own script and image loads. These restrictions prevent external requests from receiving the forwarded cookie, but they are not a security boundary for course-authored code: same-origin `GET` requests still use the rendering session. Cross-origin question assets must be served through PrairieLearn to appear in the output.

The caller owns the paginated HTML page. It must set `document.documentElement.dataset.printStatus` to `ready` after Paged.js finishes, or to `error` with a `data-print-error` message if pagination fails. The page's CSS `@page` rule is authoritative for the physical paper size.

For outputs that also need metadata from the paginated page, use `renderer.render(options, output)` with a custom `PrintablePageOutput`. Its `produce(page)` callback can inspect the DOM and then call `createPdfOutput().produce(page)` to reuse the standard PDF output.

### Validating PDF accessibility

PDF exports require a JDK (Java 17 or newer), PDFBox **3.0.8**, and veraPDF **1.30.3**. Run `./scripts/install-print-pdf-tools.sh` once from the repository root to install the pinned, checksum-verified tools in `.local/print-pdf-tools`. Docker and CI install them automatically. Set `JAVA_HOME` if your Java installation requires it. No tools are downloaded during an export.

Validate the actual downloaded PDFs from the repository root:

```sh
node scripts/validate-print-pdfs.mts \
  --verapdf .local/print-pdf-tools/verapdf/verapdf \
  --output /tmp/print-pdfua-review \
  assessment.pdf answer-key.pdf packet.pdf
```

The output directory must be new and its parent must exist. The script checks the veraPDF version, retains the exact input bytes, runs `--flavour ua1`, and saves full JSON reports, validator logs, readable failure details, and a summary. It exits unsuccessfully for validation failures, unreadable inputs, parsing errors, or tool errors. Omit `--verapdf` when the executable is on `PATH`; set `JAVA_HOME` if your Java installation requires it.

Include math, figures, lists, and tables in the assessment and answer key, and repeated forms and an uploaded cover in the final assembled packet. Validate after assembly because page copying can lose document structure and language. A passing automated report covers only machine-verifiable requirements: review the final files with assistive technology for reading order, navigation, mathematical meaning, table relationships, and useful descriptions before claiming PDF/UA-1 compliance.

`createPdfOutput()` preserves browser tags, restores source-declared formulas and decorative content, adds document metadata, and runs veraPDF on its final bytes. It rejects missing descriptions, lost structure, unclassified drawing, and validation failures. Diagnostic JSON and logs from failed validation remain in the server's temporary directory; temporary PDFs are removed. The thrown validation error carries the report path for server-side diagnosis.

The source must provide a title, language, correctly nested headings/lists/tables, and descriptions for meaningful graphics. MathJax SVG output must retain its spoken description. A template can identify wholly decorative content with `data-print-pdf-role="Artifact"`. For a container whose own background/border is decorative, set `data-print-pdf-role="Div"` (or its actual paragraph/heading role) and `data-print-pdf-decorative-paint`; its descendants remain meaningful. Only that container's marked drawing is made decorative, and the processor rejects text or images in it. Materialize repeated CSS-generated footer text as real DOM content before marking it decorative. Never use these annotations to hide meaningful author content.

## Combining question fragments

Questions are normally rendered in separate documents, so author-generated IDs can repeat between questions. Built-in formula-editor symbolic inputs and sketch inputs generate unique DOM IDs when rendered while keeping their answer names stable. Before combining fragments in a preview or print document, use `namespaceQuestionHtmls` with a stable, unique namespace for each question. It renames IDs repeated across fragments and supported references in the rendered HTML: ID-reference attributes, inline `style` attributes and `<style>` blocks, and literal `getElementById`, `querySelector`, `querySelectorAll`, `closest`, `matches`, and `$` calls in inline scripts.

The helper does not read external CSS or JavaScript files. IDs referenced from those files must be unique across the combined fragments. If an ID collides, the HTML ID is renamed but the external reference stays the same; the helper cannot detect or report the broken reference. Custom course elements remain best-effort for printable exams, so preview the output before printing. It namespaces IDs inside each `pl-graph` SVG before checking for duplicate IDs within one fragment. Other duplicate IDs within one fragment, or any duplicate IDs left after namespacing, are rejected.
