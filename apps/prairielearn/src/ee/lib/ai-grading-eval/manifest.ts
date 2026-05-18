import path from 'node:path';

import fs from 'fs-extra';
import { z } from 'zod';

const QID_REGEX = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

export const EvalEntrySchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(QID_REGEX, 'eval id must be a valid QID-style slug (letters, digits, _, -)'),
  directory: z.string().min(1),
  /**
   * Total points the scaffolded assessment question is worth. Drives the
   * `points` field of the AQ in the synthetic `infoAssessment.json`, which
   * in turn determines `max_points` / `max_manual_points` after sync.
   */
  max_points: z.number().positive(),
  /**
   * Set to `true` when the eval's `submissions.csv` is PrairieLearn's
   * group-work export (`Group name` / `Usernames` columns instead of
   * `UID`). The scaffolded assessment is then marked `groupWork: true` so
   * `uploadSubmissions()` accepts the CSV.
   */
  group_work: z.boolean().default(false),
});
export type EvalEntry = z.infer<typeof EvalEntrySchema>;

export const EvalsManifestSchema = z.object({
  name: z.string().min(1),
  evals: z.array(EvalEntrySchema).min(1),
});
export type EvalsManifest = z.infer<typeof EvalsManifestSchema>;

export const RubricItemSchema = z.object({
  order: z.number().int().nonnegative(),
  points: z.number(),
  description: z.string(),
  explanation: z.string().default(''),
  grader_note: z.string().default(''),
  always_show_to_students: z.boolean(),
});
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const RubricFileSchema = z
  .object({
    max_extra_points: z.number().default(0),
    min_points: z.number().default(0),
    replace_auto_points: z.boolean().default(false),
    starting_points: z.number().default(0),
    grader_guidelines: z.string().default(''),
    rubric_items: z.array(RubricItemSchema).min(1),
  })
  // Allow `max_points` / `max_manual_points` / `max_auto_points` from PL's
  // rubric-settings export to pass through unread — the AQ point total is
  // configured via the eval entry's `max_points` field, not the rubric file.
  .passthrough();
export type RubricFile = z.infer<typeof RubricFileSchema>;

/**
 * The minimum set of files we require to exist for each eval entry. We don't
 * parse them here (info.json / question.html / server.py / submissions.csv
 * are consumed by later steps); we only check that they're present so the
 * harness fails fast before doing any DB writes.
 */
const REQUIRED_EVAL_FILES = [
  'info.json',
  'question.html',
  'server.py',
  'rubric.json',
  'submissions.csv',
] as const;

export interface LoadedEval {
  entry: EvalEntry;
  absoluteDir: string;
  rubric: RubricFile;
}

export interface LoadedManifest {
  manifest: EvalsManifest;
  evals: LoadedEval[];
}

/**
 * Reads `evals.json` from an eval repo on disk, validates its shape, and
 * loads + validates each eval's rubric file. Per-eval question / submission
 * files are checked for existence but not parsed (those are owned by later
 * steps in the workflow).
 */
export async function loadManifest(evalsDir: string): Promise<LoadedManifest> {
  const manifestPath = path.join(evalsDir, 'evals.json');
  if (!(await fs.pathExists(manifestPath))) {
    throw new Error(`evals.json not found at ${manifestPath}`);
  }

  const raw = await fs.readJson(manifestPath);
  const manifest = EvalsManifestSchema.parse(raw);

  const seenIds = new Set<string>();
  const evals: LoadedEval[] = [];
  for (const entry of manifest.evals) {
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate eval id "${entry.id}" in evals.json`);
    }
    seenIds.add(entry.id);

    const absoluteDir = path.resolve(evalsDir, entry.directory);
    if (!absoluteDir.startsWith(path.resolve(evalsDir) + path.sep)) {
      throw new Error(
        `Eval directory "${entry.directory}" for id "${entry.id}" must be inside the eval repo`,
      );
    }
    if (!(await fs.pathExists(absoluteDir))) {
      throw new Error(`Eval directory not found: ${absoluteDir} (for id "${entry.id}")`);
    }

    for (const file of REQUIRED_EVAL_FILES) {
      const filePath = path.join(absoluteDir, file);
      if (!(await fs.pathExists(filePath))) {
        throw new Error(`Required file missing for eval "${entry.id}": ${filePath}`);
      }
    }

    const rubricRaw = await fs.readJson(path.join(absoluteDir, 'rubric.json'));
    const rubric = RubricFileSchema.parse(rubricRaw);

    evals.push({ entry, absoluteDir, rubric });
  }

  return { manifest, evals };
}
