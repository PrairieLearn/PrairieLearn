# `@prairielearn/printing`

Utilities for rendering printable HTML as PDFs. The PrairieLearn
application loads and renders assessment questions; this package handles document output and
namespacing question HTML so the fragments can share a page.

## Rendering PDFs

`PrintRenderer` turns a paginated printable page into a PDF (`renderPdf`). Create one renderer per process and keep it for the life of the process:

```ts
import { PrintRenderer } from '@prairielearn/printing';

const renderer = new PrintRenderer({ browserWSEndpoint: config.printingPlaywrightWsEndpoint });
const pdf = await renderer.renderPdf({ url: previewUrl, cookieHeader: req.get('cookie') });
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

## Combining question fragments

Questions are normally rendered in separate documents, so author- and element-generated IDs can
repeat between questions. Before combining fragments in a preview or print document, use
`namespaceQuestionHtmls` with a stable, unique namespace for each question. It updates duplicate IDs
and their standard HTML references. Formula-editor symbolic inputs and sketch inputs also have their
base name and initializer namespaced because their client renderers derive element IDs from those
names.
