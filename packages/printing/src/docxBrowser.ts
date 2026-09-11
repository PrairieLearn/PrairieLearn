export interface DocxSource {
  html: string;
  figures: { id: string; width: number; height: number; alt: string }[];
}

/** Preserve MathML before print transforms clone or replace already-typeset elements. */
export function annotateDocxMath(source: HTMLElement): void {
  const mathJax = Reflect.get(window, 'MathJax') as
    | {
        startup?: {
          document?: { math?: Iterable<{ typesetRoot: Element; math: string; display: boolean }> };
        };
        tex2mml?: (tex: string, options: { display: boolean }) => string;
      }
    | undefined;
  for (const item of mathJax?.startup?.document?.math ?? []) {
    if (!source.contains(item.typesetRoot)) continue;
    const mathml = mathJax?.tex2mml?.(item.math, { display: item.display });
    if (mathml) item.typesetRoot.setAttribute('data-docx-math', mathml);
  }
}

/** Runs before pagination, while the complete questions and their geometry exist. */
export function captureDocxSource(source: HTMLElement): DocxSource {
  const figures: DocxSource['figures'] = [];
  const result = document.createElement('div');

  function copy(element: Element): Element | null {
    const style = getComputedStyle(element);
    if (
      element.matches(
        'script, style, noscript, template, button, link, meta, .visually-hidden, .sr-only, .modal, .popover, .tooltip',
      ) ||
      style.display === 'none' ||
      style.visibility === 'hidden'
    ) {
      return null;
    }

    if (element.tagName.toLowerCase() === 'mjx-container') {
      const mathml =
        element.getAttribute('data-docx-math') ??
        element.querySelector('mjx-assistive-mml math')?.outerHTML;
      if (!mathml) throw new Error('An equation could not be converted to editable Word math');
      const container = document.createElement('span');
      container.setAttribute('data-docx-math', mathml);
      if (element.getAttribute('display') === 'true') {
        container.setAttribute('data-docx-display', 'true');
      }
      return container;
    }

    const rect = element.getBoundingClientRect();
    if (element.matches('img, svg, canvas')) {
      if (!rect.width || !rect.height) return null;
      const id = String(figures.length + 1);
      const alt =
        element.getAttribute('alt') ??
        element.getAttribute('aria-label') ??
        element.querySelector('title')?.textContent ??
        'Question figure';
      figures.push({ id, width: rect.width, height: rect.height, alt });
      element.setAttribute('data-docx-figure', id);
      const image = document.createElement('img');
      image.setAttribute('data-docx-figure', id);
      return image;
    }

    const clone = element.cloneNode(false) as Element;
    clone.removeAttribute('style');
    clone.setAttribute('data-docx-width', String(rect.width));
    clone.setAttribute('data-docx-height', String(rect.height));
    if (element.matches('.printing-answer-key-content .pl-order-block')) {
      clone.setAttribute('data-docx-indent', String(Number.parseFloat(style.marginLeft)));
      if (/monospace|courier/i.test(style.fontFamily)) {
        clone.setAttribute('data-docx-mono', 'true');
      }
    }
    if (['block', 'flex', 'grid', 'list-item'].includes(style.display)) {
      clone.setAttribute('data-docx-block', 'true');
    }
    if (style.textAlign === 'center' || style.textAlign === 'right') {
      clone.setAttribute('data-docx-align', style.textAlign);
    }
    if (Number(style.fontWeight) >= 600) clone.setAttribute('data-docx-bold', 'true');
    if (style.fontStyle === 'italic') clone.setAttribute('data-docx-italic', 'true');
    if (element instanceof HTMLAnchorElement) clone.setAttribute('href', element.href);
    for (const child of element.childNodes) {
      if (child instanceof Element) {
        const copied = copy(child);
        if (copied) clone.append(copied);
      } else if (child.nodeType === Node.TEXT_NODE) {
        clone.append(child.cloneNode());
      }
    }
    return clone;
  }

  for (const question of source.querySelectorAll('.printing-question')) {
    const clone = copy(question);
    if (clone) result.append(clone);
  }
  return { html: result.innerHTML, figures };
}
