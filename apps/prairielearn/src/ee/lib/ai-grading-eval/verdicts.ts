import crypto from 'node:crypto';
import path from 'node:path';

import { parse as csvParse } from 'csv-parse/sync';
import fs from 'fs-extra';
import { z } from 'zod';

import { type ServerJob } from '../../../lib/server-jobs.js';

import { type LoadedEval } from './manifest.js';

type Verdict = 'correct' | 'incorrect';

export interface VerdictEntry {
  case_id: string;
  eval_id: string;
  submission_identifier: string;
  rubric_descriptions: string[];
  verdict: Verdict;
  source: string;
  annotator: string | null;
  timestamp: string | null;
  notes: string | null;
}

interface VerdictMapValue {
  verdict: Verdict;
  source: string;
}

export type VerdictMap = Map<string, VerdictMapValue>;

const VerdictCsvRowSchema = z.object({
  case_id: z.string().min(1),
  submission_identifier: z.string().min(1),
  rubric_descriptions: z.string(),
  verdict: z.enum(['correct', 'incorrect']),
  annotator: z.string().optional().default(''),
  timestamp: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

const DESCRIPTION_SEPARATOR = '|';

export function computeCaseId(
  evalId: string,
  submissionIdentifier: string,
  descriptions: string[],
): string {
  const sortedJoined = [...descriptions].sort().join('\n');
  return crypto
    .createHash('sha256')
    .update(`${evalId}\0${submissionIdentifier}\0${sortedJoined}`)
    .digest('hex');
}

function decodeDescriptions(raw: string): string[] {
  if (raw === '') return [];
  return raw.split(DESCRIPTION_SEPARATOR);
}

export function encodeDescriptions(descriptions: string[]): string {
  return [...descriptions].sort().join(DESCRIPTION_SEPARATOR);
}

export async function loadVerdictsFromCsvs(
  loadedEval: LoadedEval,
  job: ServerJob,
): Promise<VerdictEntry[]> {
  const verdictsDir = path.join(loadedEval.absoluteDir, 'verdicts');
  if (!(await fs.pathExists(verdictsDir))) return [];

  const dirEntries = await fs.readdir(verdictsDir);
  const csvFiles = dirEntries.filter((name) => name.toLowerCase().endsWith('.csv')).sort();

  if (csvFiles.length === 0) return [];

  const entries: VerdictEntry[] = [];
  for (const filename of csvFiles) {
    const filePath = path.join(verdictsDir, filename);
    const buffer = await fs.readFile(filePath);
    let rows: unknown[];
    try {
      rows = csvParse(buffer, { columns: true, bom: true, trim: true, skip_empty_lines: true });
    } catch (err) {
      job.warn(`Failed to parse verdicts file ${filename}: ${(err as Error).message}`);
      continue;
    }

    const before = entries.length;
    for (const [rowIndex, raw] of rows.entries()) {
      const parsed = VerdictCsvRowSchema.safeParse(raw);
      if (!parsed.success) {
        job.warn(
          `Skipping invalid row ${rowIndex + 2} in ${filename}: ${parsed.error.issues
            .map((i) => i.message)
            .join('; ')}`,
        );
        continue;
      }

      const descriptions = decodeDescriptions(parsed.data.rubric_descriptions);
      const expectedCaseId = computeCaseId(
        loadedEval.entry.id,
        parsed.data.submission_identifier,
        descriptions,
      );
      if (parsed.data.case_id !== expectedCaseId) {
        job.warn(
          `case_id mismatch in ${filename} row ${rowIndex + 2}: stored=${parsed.data.case_id}, recomputed=${expectedCaseId}. Using recomputed value.`,
        );
      }

      entries.push({
        case_id: expectedCaseId,
        eval_id: loadedEval.entry.id,
        submission_identifier: parsed.data.submission_identifier,
        rubric_descriptions: descriptions,
        verdict: parsed.data.verdict,
        source: `csv:${filename}`,
        annotator: parsed.data.annotator || null,
        timestamp: parsed.data.timestamp || null,
        notes: parsed.data.notes || null,
      });
    }
    const loadedRows = entries.length - before;
    job.info(`  verdicts/${filename}: ${loadedRows} row(s) loaded`);
  }

  return entries;
}

/**
 * Merges verdict entries into a single map keyed by case_id. Later entries
 * overwrite earlier ones, so callers should pass `submissions.csv`-derived
 * seed entries first followed by CSV-loaded entries (filename-sorted) so
 * explicit annotator decisions override the seed.
 */
export function buildVerdictMap(entries: VerdictEntry[]): VerdictMap {
  const map: VerdictMap = new Map();
  for (const entry of entries) {
    map.set(entry.case_id, { verdict: entry.verdict, source: entry.source });
  }
  return map;
}
