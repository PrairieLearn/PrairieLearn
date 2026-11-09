/* eslint-disable @html-eslint/head-order -- MathJax reads its font-path metadata synchronously during initialization. */
import * as cheerio from 'cheerio';

import { html, unsafeHtml } from '@prairielearn/html';

import { BaseHeadContents } from '../../../components/HeadContents.js';
import { compiledScriptTag, nodeModulesAssetPath } from '../../../lib/assets.js';
import { serializePrintDocument } from '../../../lib/client/print-document.js';
import { initializeQuestionRendering } from '../../../lib/client/question-rendering.js';
import { config } from '../../../lib/config.js';
import { getPrintRenderer } from '../../../lib/printing/index.js';
import type { PrintAssetScope } from '../../../lib/printing/print-asset-access.js';

import { stripHtmlForAiGrading } from './ai-grading-render.js';

/** Prepare a single panel in isolation so authored IDs and scripts retain their original meaning. */
export async function prepareCanvasHtmlForAiGrading({
  panelHtml,
  extraHeadersHtml,
  urlPrefix,
  assetScope,
}: {
  panelHtml: string;
  extraHeadersHtml: string;
  urlPrefix: string;
  assetScope: PrintAssetScope;
}): Promise<string> {
  if (!panelHtml.trim() || !/<(?:canvas|script)\b/i.test(panelHtml + extraHeadersHtml)) {
    return await stripHtmlForAiGrading(panelHtml);
  }
  const documentHtml = html`
    <!doctype html>
    <html lang="en" data-print-status="preparing">
      <head>
        <meta
          name="mathjax-fonts-path"
          content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
        />
        <script>
          document.urlPrefix = ${unsafeHtml(JSON.stringify(urlPrefix).replaceAll('<', '\\u003c'))};
          (${unsafeHtml(initializeQuestionRendering.toString())})(true);
        </script>
        ${BaseHeadContents({ resLocals: {}, pageTitle: 'AI grading canvas rendering' })}
        <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
        ${compiledScriptTag('ai-grading-canvas-client.ts')} ${unsafeHtml(extraHeadersHtml)}
      </head>
      <body>
        ${unsafeHtml(panelHtml)}
      </body>
    </html>
  `.toString();
  const preparedHtml = await getPrintRenderer().render(
    {
      url: new URL(
        `${urlPrefix}/ai-grading-canvas`,
        `${config.serverType}://localhost:${config.serverPort}`,
      ).href,
      browserOrigin: config.serverCanonicalHost ?? undefined,
      html: documentHtml,
      runScripts: true,
      assetScope: { ...assetScope, purpose: 'ai_grading' },
    },
    {
      label: 'AI grading canvases',
      produce: async (page) => await page.locator('body').evaluate(serializePrintDocument),
    },
  );
  // The serializer preserves clonable shadow roots; expose their contents to the HTML prompt parser.
  const $ = cheerio.load(preparedHtml);
  $('template[shadowrootmode]').each((_, template) => {
    $(template).replaceWith($(template).html() ?? '');
  });
  return await stripHtmlForAiGrading($('body').html() ?? '');
}
