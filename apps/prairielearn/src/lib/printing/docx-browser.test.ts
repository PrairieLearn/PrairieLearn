import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';

import { annotateDocxMath, captureDocxSource } from './docx-browser.js';

afterEach(() => vi.unstubAllGlobals());

it('keeps a printable PDF render available when an equation cannot become Word math', () => {
  const dom = new JSDOM(`
    <div id="source">
      <div class="printing-question">
        <div class="question-body"><mjx-container>Rendered equation</mjx-container></div>
      </div>
    </div>
  `);
  const { window } = dom;
  const source = window.document.querySelector<HTMLElement>('#source')!;
  const equation = source.querySelector('mjx-container')!;
  window.Element.prototype.getBoundingClientRect = () => ({ width: 120, height: 30 }) as DOMRect;
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Element', window.Element);
  vi.stubGlobal('HTMLAnchorElement', window.HTMLAnchorElement);
  vi.stubGlobal('HTMLSlotElement', window.HTMLSlotElement);
  vi.stubGlobal('Node', window.Node);
  vi.stubGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  Reflect.set(window, 'MathJax', {
    startup: {
      document: { math: [{ typesetRoot: equation, math: '\\unsupported', display: false }] },
    },
    tex2mml: () => {
      throw new Error('Unsupported Word math');
    },
  });

  expect(() => annotateDocxMath(source)).not.toThrow();
  const captured = captureDocxSource(source);
  expect(captured.figures).toEqual([{ id: '1', width: 120, height: 30, alt: 'Equation' }]);
  expect(captured.html).toContain('<img data-docx-figure="1">');
});
