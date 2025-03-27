import { html } from '@prairielearn/html';

export function AiGradingHtmlPreview(panelHtml: string) {
  return html`<pre class="mb-0"><code>${panelHtml}</code></pre>`;
}
