import { z } from 'zod';

import type { DocxSource } from './docx-browser.js';

export const DocxSourceSchema = z.strictObject({
  html: z.string(),
  figures: z.array(
    z.strictObject({
      id: z.string().regex(/^[1-9]\d*$/),
      width: z.number().positive().max(4096),
      height: z.number().positive().max(4096),
      alt: z.string(),
    }),
  ),
}) satisfies z.ZodType<DocxSource>;
