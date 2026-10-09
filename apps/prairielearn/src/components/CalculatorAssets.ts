import { html } from '@prairielearn/html';

import { compiledScriptTag, compiledStylesheetTag, nodeModulesAssetPath } from '../lib/assets.js';

export function CalculatorDrawerHeadScripts() {
  return html`
    <script src="${nodeModulesAssetPath('mathlive/mathlive.min.js')}"></script>
    ${compiledScriptTag('calculatorClient.ts')} ${compiledStylesheetTag('calculator.css')}
  `;
}

export function CalculatorPreviewAssets() {
  return html`
    ${compiledStylesheetTag('calculator.css')}
    <link rel="stylesheet" href="${nodeModulesAssetPath('mathlive/mathlive-static.css')}" />
    <script src="${nodeModulesAssetPath('mathlive/mathlive.min.js')}"></script>
    ${compiledScriptTag('calculatorPreviewClient.ts')}
  `;
}
