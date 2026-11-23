/**
 * Save clonable shadow-root content and scoped styles along with the printable page.
 * Runs in the renderer's browser through Playwright's evaluate(), so keep it self-contained.
 */
export function serializePrintDocument(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  const roots: ParentNode[] = [copy];
  const shadowRoots: ShadowRoot[] = [];
  while (roots.length > 0) {
    const root = roots.pop()!;
    root
      .querySelectorAll('script, noscript, iframe, meta[http-equiv="refresh"]')
      .forEach((element) => element.remove());
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) {
        shadowRoots.push(element.shadowRoot);
        roots.push(element.shadowRoot);
      }
      if (element.tagName === 'TEMPLATE') {
        roots.push((element as HTMLTemplateElement).content);
      }
    }
  }
  const container = root.ownerDocument.createElement('div');
  container.append(copy);
  // Normalize Paged.js's cloned document wrappers before the snapshot is loaded again.
  const normalized = new DOMParser().parseFromString(
    container.getHTML({ shadowRoots }),
    'text/html',
  );
  return `<!doctype html>\n${normalized.documentElement.outerHTML}`;
}
