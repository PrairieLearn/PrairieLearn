import { devices, expect, test } from '@playwright/test';

/**
 * Tests that pl-drawing LaTeX expressions render correctly in WebKit (Safari).
 *
 * The bug: MathJax's SVG output uses <use> elements referencing shared glyphs
 * in <defs>. The old code cloned these via jQuery ($(el.outerHTML)[0]), which
 * creates elements in the XHTML namespace instead of the SVG namespace. When
 * serialized with XMLSerializer and loaded as a data: URI image, WebKit's
 * strict XML/SVG parser ignores the XHTML-namespaced <path> elements, so
 * complex expressions (like integrals with multiple glyphs) never render.
 *
 * The fix: use cloneNode(true) instead of jQuery HTML parsing, which preserves
 * the SVG namespace on cloned elements.
 *
 * Run with ./apps/prairielearn/src/tests/e2e/run-safari-test.sh
 */
test.use({
  ...devices['Desktop Safari'],
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
});

const QUESTION_PREVIEW_URL = process.env.QUESTION_URL || '/pl/course/1/question/111/preview';

// The "Moment of inertia" drawing is the 30th pl-drawing in the
// element/drawingGallery question (question.html line 215), index 29.
const MOMENT_OF_INERTIA_CONTAINER_INDEX = 29;

test.describe('pl-drawing LaTeX rendering in WebKit', () => {
  test('LaTeX integral renders in the Moment of inertia drawing', async ({ page }) => {
    await page.goto(QUESTION_PREVIEW_URL);
    await page.waitForLoadState('networkidle');

    // Wait for MathJax and fabric canvases
    await page.waitForFunction(
      () =>
        (window as any).MathJax !== undefined && (window as any).MathJax.startup?.promise != null,
      { timeout: 30000 },
    );
    await page.waitForFunction(() => document.querySelectorAll('canvas.lower-canvas').length > 0, {
      timeout: 30000,
    });

    // Wait for async gen_text calls (MathJax render + image load)
    await page.waitForTimeout(10000);

    // The "Moment of inertia" drawing has two pl-text elements on one canvas:
    //   1. "Moment of inertia:" at y1=40 (plain text, latex="false") — always renders
    //   2. "\int_A y^2 dA" at y1=80 (LaTeX) — BROKEN on old Safari
    //
    // Both are rendered onto a fabric.js canvas as images, not DOM text.
    // We check the BOTTOM half of the canvas for dark pixels — if the LaTeX
    // integral rendered, there will be many. If only the plain text label
    // rendered, the bottom half will be empty (just grid background).
    const canvasInfo = await page.evaluate((containerIdx) => {
      const containers = document.querySelectorAll('.pl-drawing-container');
      if (containerIdx >= containers.length) return { found: false, total: containers.length };

      const container = containers[containerIdx];
      container.scrollIntoView({ block: 'center' });

      const canvasEl = container.querySelector<HTMLCanvasElement>('canvas.lower-canvas');
      if (!canvasEl) return { found: true, canvasFound: false };

      const ctx = canvasEl.getContext('2d');
      if (!ctx) return { found: true, canvasFound: true, ctxFound: false };

      const midY = Math.floor(canvasEl.height / 2);

      const countDark = (data: ImageData) => {
        let count = 0;
        for (let i = 0; i < data.data.length; i += 4) {
          const r = data.data[i];
          const g = data.data[i + 1];
          const b = data.data[i + 2];
          const a = data.data[i + 3];
          if (a > 0 && r < 100 && g < 100 && b < 100) count++;
        }
        return count;
      };

      const topDark = countDark(ctx.getImageData(0, 0, canvasEl.width, midY));
      const botDark = countDark(ctx.getImageData(0, midY, canvasEl.width, canvasEl.height - midY));

      return {
        found: true,
        canvasFound: true,
        ctxFound: true,
        topDark,
        botDark,
        width: canvasEl.width,
        height: canvasEl.height,
      };
    }, MOMENT_OF_INERTIA_CONTAINER_INDEX);

    console.log('Moment of inertia canvas info:', JSON.stringify(canvasInfo, null, 2));

    // Screenshot the area around the drawing
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/drawingGallery-moment-of-inertia.png' });

    expect(canvasInfo.found, 'Drawing container not found').toBe(true);
    expect(canvasInfo.canvasFound, 'Canvas not found in container').toBe(true);
    if (!('botDark' in canvasInfo)) return;

    // Sanity check: the top half should have the "Moment of inertia:" label
    expect(canvasInfo.topDark, 'Top half should have the plain text label').toBeGreaterThan(500);

    // The LaTeX integral (\int_A y^2 dA) should produce dark pixels in the
    // bottom half. If the SVG serialization bug prevents it from loading,
    // there will be 0 dark pixels there.
    expect(
      canvasInfo.botDark,
      'LaTeX expression (\\int_A y^2 dA) did not render in the bottom half of the canvas. ' +
        `Top half has ${canvasInfo.topDark} dark pixels (the plain text label), ` +
        `but bottom half has only ${canvasInfo.botDark}. ` +
        'This is the Safari SVG XML serialization bug.',
    ).toBeGreaterThan(200);
  });
});
