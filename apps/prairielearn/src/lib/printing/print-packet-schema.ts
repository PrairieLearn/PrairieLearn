import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { MAX_PRINT_FORMS } from '../client/printing/print-packet.js';

export const PrintPacketMetadataSchema = z.strictObject({
  forms: z
    .array(
      z.strictObject({
        printFormId: IdSchema,
      }),
    )
    .min(1)
    .max(MAX_PRINT_FORMS)
    .refine(
      (forms) => new Set(forms.map((form) => form.printFormId)).size === forms.length,
      'Select each print form only once.',
    ),
  document: z.enum(['assessment', 'answer_key']),
});
