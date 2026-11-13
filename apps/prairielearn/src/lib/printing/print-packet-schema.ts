import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { MAX_PRINT_COPIES, MAX_PRINT_FORMS } from '../client/printing/print-packet.js';

import { PrintSettingsSchema } from './print-settings.js';

export const PrintPacketMetadataSchema = z.strictObject({
  forms: z
    .array(
      z.strictObject({
        printFormId: IdSchema,
        settings: PrintSettingsSchema,
      }),
    )
    .min(1)
    .max(MAX_PRINT_FORMS)
    .refine(
      (forms) => new Set(forms.map((form) => form.printFormId)).size === forms.length,
      'Select each print form only once.',
    ),
  copies: z.number().int().min(1).max(MAX_PRINT_COPIES),
  document: z.enum(['assessment', 'answer_key', 'booklet']),
});
