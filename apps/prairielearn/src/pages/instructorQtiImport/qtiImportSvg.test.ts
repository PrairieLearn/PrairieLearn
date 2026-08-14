import { describe, expect, it } from 'vitest';

import { sanitizeQtiImportSvg } from './qtiImportSvg.js';

const CANVAS_EQUATION_SVG =
  '<svg xmlns:xlink="http://www.w3.org/1999/xlink" width="1.488ex" height="1.676ex" style="vertical-align: -0.338ex;" viewBox="0 -576.1 640.5 721.6" role="img" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><path stroke-width="1" id="E1-MJMATHI-3B1" d="M34 156Q34 270 120 356T309 442"></path></defs><g stroke="currentColor" fill="currentColor" stroke-width="0" transform="matrix(1 0 0 -1 0 0)"><use href="#E1-MJMATHI-3B1" x="0" y="0"></use></g></svg>';

describe('sanitizeQtiImportSvg', () => {
  it('preserves the features used by Canvas equation images', () => {
    const sanitized = sanitizeQtiImportSvg(Buffer.from(CANVAS_EQUATION_SVG)).toString();

    expect(sanitized).toContain('<svg');
    expect(sanitized).toContain('style="vertical-align: -0.338ex"');
    expect(sanitized).toContain('<path');
    expect(sanitized).toContain('<use href="#E1-MJMATHI-3B1"');
    expect(sanitized).toContain('transform="matrix(1 0 0 -1 0 0)"');
  });

  it('removes active content and external references', () => {
    const scriptUrl = `${['java', 'script'].join('')}:alert(1)`;
    const sanitized = sanitizeQtiImportSvg(
      Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:base="https://example.com/" onload="alert(1)">
          <defs><path id="safe" d="M0 0" /></defs>
          <script>alert(1)</script>
          <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
          <style>@import url(https://example.com/style.css);</style>
          <animate attributeName="href" to="https://example.com/image.svg" />
          <image href="https://example.com/image.png" />
          <image xlink:href="https://example.com/xlink-image.png" />
          <image href="data:image/svg+xml;base64,PHN2Zy8+" />
          <use href="https://example.com/image.svg#shape" />
          <use href="#safe" />
          <a href="${scriptUrl}"><path d="M0 0" /></a>
          <path
            fill="url(https://example.com/fill.svg)"
            cursor="u/**/rl(https://example.com/cursor.svg)"
            stroke="url(#safe)"
            style="fill: red; filter: u\\72l(https://example.com/filter.svg); vertical-align: middle"
          />
        </svg>
      `),
    ).toString();

    expect(sanitized).not.toContain('script');
    expect(sanitized).not.toContain('foreignObject');
    expect(sanitized).not.toContain('<style');
    expect(sanitized).not.toContain('<animate');
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain(scriptUrl);
    expect(sanitized).not.toContain('https://example.com');
    expect(sanitized).not.toContain('data:image/svg+xml');
    expect(sanitized).not.toContain('fill="url(');
    expect(sanitized).toContain('<use href="#safe"');
    expect(sanitized).toContain('stroke="url(#safe)"');
    expect(sanitized).toContain('style="fill: red; vertical-align: middle"');
  });

  it('allows embedded raster images', () => {
    const sanitized = sanitizeQtiImportSvg(
      Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg">
          <image href="data:image/png;base64,iVBORw0KGgo=" />
        </svg>
      `),
    ).toString();

    expect(sanitized).toContain('href="data:image/png;base64,iVBORw0KGgo="');
  });

  it.each([
    '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" />',
    '<svg xmlns="http://www.w3.org/2000/svg"><g></svg>',
    '<html xmlns="http://www.w3.org/1999/xhtml"></html>',
  ])('rejects invalid SVG input', (source) => {
    expect(() => sanitizeQtiImportSvg(Buffer.from(source))).toThrow();
  });

  it('rejects non-UTF-8 input', () => {
    expect(() => sanitizeQtiImportSvg(Buffer.from([0xff, 0xfe]))).toThrow();
  });
});
