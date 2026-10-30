export interface PdfAccessibilityManifest {
  title: string;
  language: string;
  tags: {
    marker: string;
    role: string;
    alt?: string;
    decorativePaint?: boolean;
  }[];
}

/** Runs in the export browser after pagination; the preview remains unchanged. */
export function preparePdfAccessibility(): PdfAccessibilityManifest | { error: string } {
  const title = document.title.trim();
  const language = document.documentElement.lang.trim();
  if (!title || !language) {
    throw new Error('PDF export requires a document title and language.');
  }
  const tags: PdfAccessibilityManifest['tags'] = [];
  const prefix = `pl-pdf-${crypto.getRandomValues(new Uint32Array(4)).join('-')}-`;
  // Object methods avoid compiler naming helpers that are unavailable in page.evaluate().
  const helpers = {
    visible(element: Element) {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return bounds.width > 0 && bounds.height > 0 && style.visibility === 'visible';
    },
    referencedText(element: Element, attribute: string) {
      return element
        .getAttribute(attribute)
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
    },
    description(element: Element, fallbackName = '') {
      const name = (
        helpers.referencedText(element, 'aria-labelledby') ||
        element.getAttribute('aria-label') ||
        element.getAttribute('alt') ||
        element.getAttribute('alttext') ||
        element.querySelector(':scope > title')?.textContent ||
        fallbackName
      ).trim();
      const detail = (
        helpers.referencedText(element, 'aria-describedby') ||
        element.getAttribute('aria-description') ||
        element.querySelector(':scope > desc')?.textContent ||
        ''
      ).trim();
      return [...new Set([name, detail].filter(Boolean))].join('. ');
    },
    mark(
      element: Element,
      role: string,
      { alt, decorativePaint }: { alt?: string; decorativePaint?: boolean } = {},
    ) {
      const marker = `${prefix}${tags.length}`;
      tags.push({ marker, role, alt, decorativePaint });
      // Figure preserves child headings, lists, and tables while carrying a source marker into PDF.
      element.setAttribute('role', decorativePaint || role === 'Link' ? 'figure' : 'img');
      element.setAttribute('aria-label', marker);
      element.removeAttribute('aria-labelledby');
      element.removeAttribute('aria-hidden');
      element.setAttribute('data-print-pdf-marked', role);
    },
  };

  for (const element of document.querySelectorAll('[data-print-pdf-role]')) {
    if (!helpers.visible(element)) continue;
    const role = element.getAttribute('data-print-pdf-role')!;
    if (!/^(Artifact|Div|Span|P|H[1-6])$/.test(role)) {
      throw new Error(`Unsupported PDF structure role: ${role}.`);
    }
    const decorativePaint = element.hasAttribute('data-print-pdf-decorative-paint');
    if (role !== 'Artifact' && !decorativePaint) {
      throw new Error('PDF container annotations must identify their decorative paint.');
    }
    helpers.mark(element, role, { decorativePaint });
  }

  for (const container of document.querySelectorAll('mjx-container')) {
    if (!helpers.visible(container)) continue;
    const speech = (
      container.getAttribute('data-semantic-speech-none') ||
      container.getAttribute('aria-label') ||
      ''
    ).trim();
    const svg = container.querySelector('svg');
    if (!speech || !svg) {
      return { error: 'PDF export requires MathJax SVG output with a spoken math description.' };
    }
    container.setAttribute('role', 'presentation');
    container.removeAttribute('aria-label');
    container
      .querySelectorAll('mjx-assistive-mml, mjx-speech')
      .forEach((element) => element.remove());
    helpers.mark(svg, 'Formula', { alt: speech });
  }
  for (const element of document.querySelectorAll('math, .katex, [role="math"]')) {
    if (
      !helpers.visible(element) ||
      element.closest('mjx-container, [data-print-pdf-marked="Formula"]')
    ) {
      continue;
    }
    const alt = helpers.description(element);
    if (!alt) {
      return { error: 'Add a spoken description to mathematical expressions before PDF export.' };
    }
    helpers.mark(element, 'Formula', { alt });
  }

  for (const element of document.querySelectorAll('img, svg, canvas, [role="img"]')) {
    if (
      !helpers.visible(element) ||
      element.hasAttribute('data-print-pdf-marked') ||
      element.closest(
        'mjx-container, [data-print-pdf-marked="Artifact"], [data-print-pdf-marked="Formula"], [data-print-pdf-marked="Figure"]',
      )
    ) {
      continue;
    }
    if (element.tagName.toLowerCase() === 'canvas') {
      return { error: 'Convert canvas content to a described image before PDF export.' };
    }
    const alt = helpers.description(element);
    const decorative =
      element.getAttribute('aria-hidden') === 'true' ||
      (!alt &&
        (element.getAttribute('alt') === '' ||
          ['none', 'presentation'].includes(element.getAttribute('role') ?? '')));
    // Chromium can omit a labeled wrapper around an SVG; put its semantics on the graphic.
    const child = element.children.length === 1 ? element.firstElementChild : null;
    const graphic = !element.matches('img, svg') && child?.matches('img, svg') ? child : element;
    if (graphic !== element) {
      element.setAttribute('role', 'presentation');
      for (const attribute of [
        'aria-label',
        'aria-labelledby',
        'aria-description',
        'aria-describedby',
        'aria-hidden',
      ]) {
        element.removeAttribute(attribute);
      }
    }
    if (decorative) {
      helpers.mark(graphic, 'Artifact');
    } else if (alt) {
      helpers.mark(graphic, 'Figure', { alt });
    } else {
      return {
        error: 'Add an alternative description to each meaningful image or SVG before PDF export.',
      };
    }
  }
  for (const element of document.querySelectorAll('a')) {
    if (
      !helpers.visible(element) ||
      (!element.hasAttribute('href') && !element.hasAttribute('xlink:href'))
    ) {
      continue;
    }
    if (!(element instanceof HTMLAnchorElement)) {
      return {
        error:
          'Links inside SVG images are not supported in individual PDFs. Place the link outside the image before exporting.',
      };
    }
    const uri = element.href;
    const alt = helpers.description(element, element.textContent.trim() || uri);
    helpers.mark(element, 'Link', { alt });
  }

  // The PDF page is already white; avoid painting a second white canvas behind the tagged content.
  for (const element of [document.documentElement, document.body]) {
    const style = getComputedStyle(element);
    if (
      style.backgroundImage === 'none' &&
      ['rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'].includes(style.backgroundColor)
    ) {
      element.style.setProperty('background', 'transparent', 'important');
    }
  }
  return { title, language, tags };
}
