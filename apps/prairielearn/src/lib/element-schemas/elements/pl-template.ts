import * as z from 'zod/v4';

import { booleanFormat } from '../helpers.ts';
import type { ElementSchemaModule } from '../types.ts';

const directoryAttribute = () =>
  z.enum([
    'question',
    'clientFilesQuestion',
    'clientFilesCourse',
    'serverFilesCourse',
    'courseExtensions',
  ]);

const plVariableAttributesSchema = z
  .object({
    directory: directoryAttribute().optional(),
    'file-name': z.string().optional(),
    name: z.string(),
    'trim-whitespace': booleanFormat().optional(),
  })
  .strict();

const plTemplateAttributesSchema = z
  .object({
    directory: directoryAttribute().optional(),
    'file-name': z.string(),
    'log-tag-warnings': booleanFormat().optional(),
    'log-variable-warnings': booleanFormat().optional(),
  })
  .strict();

export const element: ElementSchemaModule = {
  tag: 'pl-template',
  schema: z.toJSONSchema(plTemplateAttributesSchema, { target: 'draft-04' }),
  children: {
    'pl-variable': {
      schema: z.toJSONSchema(plVariableAttributesSchema, { target: 'draft-04' }),
    },
  },
};
