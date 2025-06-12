import * as htmx from 'htmx.org/dist/htmx.esm.js';

declare global {
  interface Window {
    htmx: typeof htmx;
  }
}

window.htmx = htmx;
