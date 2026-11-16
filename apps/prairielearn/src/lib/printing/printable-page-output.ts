import type { Page } from 'playwright';

export interface PrintablePageOutput<T> {
  /** Names the output in timeout messages, for example `PDF`. */
  label: string;
  /** Device pixel ratio of the rendering context. Element screenshots scale with it. */
  deviceScaleFactor?: number;
  /** Produces the output from a page whose pagination has reported `ready`. */
  produce: (page: Page) => Promise<T>;
}
