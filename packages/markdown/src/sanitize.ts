import assert from 'node:assert';

import createDOMPurify from 'dompurify';
import { Window } from 'happy-dom';

const window: Window = new Window();
const dompurify = createDOMPurify(window as any);

assert(dompurify.isSupported);

export function sanitizeHtml(html: string): string {
  return dompurify.sanitize(html);
}
