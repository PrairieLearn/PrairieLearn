export interface PdfAccessibilityManifest {
  title: string;
  language: string;
  tags: {
    marker: string;
    role: string;
    alt?: string;
    decorativePaint?: boolean;
  }[];
  links: { uri: string; alt: string }[];
}

/** Runs in the export browser after pagination; the preview remains unchanged. */
export function preparePdfAccessibility(): PdfAccessibilityManifest | { error: string } {
  const title = document.title.trim();
  const language = document.documentElement.lang.trim();
  if (!title || !language) {
    return { error: 'PDF export requires a document title and language.' };
  }
  const tags: PdfAccessibilityManifest['tags'] = [];
  const links: PdfAccessibilityManifest['links'] = [];
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
        element.getAttribute('aria-label') ||
        helpers.referencedText(element, 'aria-labelledby') ||
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
      element.setAttribute('role', decorativePaint ? 'figure' : 'img');
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
      return { error: `Unsupported PDF structure role: ${role}.` };
    }
    const decorativePaint = element.hasAttribute('data-print-pdf-decorative-paint');
    if (role !== 'Artifact' && !decorativePaint) {
      return { error: 'PDF container annotations must identify their decorative paint.' };
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
    container.querySelectorAll('mjx-assistive-mml').forEach((element) => element.remove());
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

  for (const element of document.querySelectorAll('img, svg, canvas')) {
    if (
      !helpers.visible(element) ||
      element.hasAttribute('data-print-pdf-marked') ||
      element.closest('[data-print-pdf-marked="Artifact"], [data-print-pdf-marked="Formula"]')
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
    if (decorative) {
      helpers.mark(element, 'Artifact');
    } else if (alt) {
      helpers.mark(element, 'Figure', { alt });
    } else {
      return {
        error: 'Add an alternative description to each meaningful image or SVG before PDF export.',
      };
    }
  }
  for (const element of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (!helpers.visible(element)) continue;
    const uri = element.href;
    const alt = helpers.description(element, element.textContent.trim() || uri);
    links.push({ uri, alt });
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
  return { title, language, tags, links };
}
