import { readFile } from 'fs/promises';
import * as path from 'path';

import { z } from 'zod';

import { logger } from '@prairielearn/logger';
import { queryAsync } from '@prairielearn/postgres';

export const AdministratorQuerySpecsSchema = z.object({
  description: z.string(),
  enabled: z.boolean().optional(),
  resultFormats: z.record(z.enum(['pre'])).optional(),
  params: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        default: z.string().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  /** If true, res.locals is passed as the 'locals' parameter to the query function. */
  pass_locals: z.boolean().optional(),
});
export type AdministratorQuerySpecs = z.infer<typeof AdministratorQuerySpecsSchema>;

export const AdministratorQueryResultSchema = z.object({
  rows: z.record(z.any()).array(),
  columns: z.string().array().readonly(),
});
export type AdministratorQueryResult = z.infer<typeof AdministratorQueryResultSchema>;

export async function runLegacySqlAdminQuery(
  metaUrl: string,
  params: Record<string, string>,
): Promise<AdministratorQueryResult> {
  const sql = await readFile(new URL(metaUrl.replace(/\.[jt]s$/, '.sql')).pathname, {
    encoding: 'utf8',
  });
  const result = await queryAsync(sql, params);
  return { rows: result.rows, columns: result.fields.map((field) => field.name) };
}

export async function loadAdminQueryModule(query: string): Promise<{
  specs: AdministratorQuerySpecs;
  default: (params: Record<string, any>) => Promise<AdministratorQueryResult>;
}> {
  if (query.endsWith('.ts')) query = query.slice(0, -3);
  if (!query.endsWith('.js')) query += '.js';

  const modulePath = path.join('..', query);
  let module: {
    specs: AdministratorQuerySpecs;
    default: (params: Record<string, any>) => Promise<AdministratorQueryResult>;
  };
  try {
    module = await import(/* @vite-ignore */ modulePath);
  } catch (err) {
    logger.error(`Failed to load module for query ${query}:`, err);
    throw new Error(`Query module ${query} could not be imported`);
  }
  try {
    module.specs = AdministratorQuerySpecsSchema.parse(module.specs);
  } catch (err) {
    logger.error(`Failed to parse specs for query ${query}:`, err);
    throw new Error(`Query module ${query} does not provide valid specs object`);
  }
  return module;
}
