/**
 * Save clonable shadow-root content and scoped styles along with the printable page.
 * Keep this self-contained so it can also run through Playwright's evaluate().
 */
export function serializePrintDocument(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.removeAttribute('data-print-snapshot-id');
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
