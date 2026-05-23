import path from 'node:path';

import fs from 'fs-extra';
import { z } from 'zod';

/**
 * Per-(eval × model) snapshot written to `<eval-dir>/runs/` at the end of a
 * grading run. Captures everything required to re-render the same stats
 * output later — *without* re-querying the database — except for the verdict
 * map, which is rebuilt on demand from `submissions.csv` (seed verdicts,
 * stored alongside) plus `verdicts/*.csv`.
 *
 * Schema-versioned so future shape changes can be detected and ignored
 * without crashing the recompute path.
 */

const SCHEMA_VERSION = 2 as const;

const SnapshotCaseSchema = z.object({
  case_id: z.string(),
  submission_identifier: z.string(),
  ai_descriptions: z.array(z.string()),
  ai_explanation: z.string().nullable(),
});

const SnapshotCostSchema = z.object({
  job_count: z.number(),
  total_cost: z.number(),
  total_prompt_tokens: z.number(),
  total_completion_tokens: z.number(),
  dominant_model: z.string().nullable(),
});

const SnapshotTimingSchema = z.object({
  start_date: z.string().nullable(),
  finish_date: z.string().nullable(),
  duration_seconds: z.number().nullable(),
});

const SnapshotSeedVerdictSchema = z.object({
  case_id: z.string(),
  submission_identifier: z.string(),
  rubric_descriptions: z.array(z.string()),
});

const RunSnapshotSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  eval_id: z.string(),
  model: z.string(),
  ai_job_sequence_id: z.string(),
  timestamp: z.string(),
  deep_link: z.string().nullable(),
  cases: z.array(SnapshotCaseSchema),
  cost: SnapshotCostSchema,
  timing: SnapshotTimingSchema.nullable(),
  seed_verdicts: z.array(SnapshotSeedVerdictSchema),
});
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;

function safeModelSlug(model: string): string {
  return model.replaceAll(/[^a-zA-Z0-9_.-]+/g, '-');
}

function safeTimestampSlug(iso: string): string {
  return iso.replaceAll(/[:.]/g, '-');
}

function runsDirForEval(evalAbsoluteDir: string): string {
  return path.join(evalAbsoluteDir, 'runs');
}

/**
 * Persists a snapshot to `<eval-dir>/runs/<timestamp>-<model>.json`.
 * Returns the absolute path written.
 */
export async function writeRunSnapshot({
  evalAbsoluteDir,
  snapshot,
}: {
  evalAbsoluteDir: string;
  snapshot: RunSnapshot;
}): Promise<string> {
  const dir = runsDirForEval(evalAbsoluteDir);
  await fs.ensureDir(dir);
  const filename = `${safeTimestampSlug(snapshot.timestamp)}-${safeModelSlug(snapshot.model)}.json`;
  const filePath = path.join(dir, filename);
  await fs.writeJson(filePath, snapshot, { spaces: 2 });
  return filePath;
}

/**
 * Loads all valid snapshots in `<eval-dir>/runs/`, skipping any file that
 * fails to parse with a warning (so a stale older-schema file doesn't break
 * recompute). Returns snapshots sorted by `timestamp` ascending.
 */
export async function listSnapshotsForEval({
  evalAbsoluteDir,
  warn,
}: {
  evalAbsoluteDir: string;
  warn: (message: string) => void;
}): Promise<RunSnapshot[]> {
  const dir = runsDirForEval(evalAbsoluteDir);
  if (!(await fs.pathExists(dir))) return [];

  const entries = await fs.readdir(dir);
  const jsonFiles = entries.filter((name) => name.toLowerCase().endsWith('.json'));

  const snapshots: RunSnapshot[] = [];
  for (const filename of jsonFiles.sort()) {
    const filePath = path.join(dir, filename);
    let raw: unknown;
    try {
      raw = await fs.readJson(filePath);
    } catch (err) {
      warn(`runs/${filename}: failed to read JSON (${(err as Error).message}). Skipped.`);
      continue;
    }
    const parsed = RunSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      warn(`runs/${filename}: not a valid snapshot for schema_version=${SCHEMA_VERSION}. Skipped.`);
      continue;
    }
    snapshots.push(parsed.data);
  }
  snapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return snapshots;
}

/**
 * Of the snapshots for a single eval, keeps only the most recent snapshot
 * per model. "Most recent" is by `timestamp` (ISO string compare).
 */
export function latestSnapshotsPerModel(snapshots: RunSnapshot[]): RunSnapshot[] {
  const latest = new Map<string, RunSnapshot>();
  for (const s of snapshots) {
    const existing = latest.get(s.model);
    if (!existing || s.timestamp > existing.timestamp) {
      latest.set(s.model, s);
    }
  }
  return [...latest.values()];
}

export { SCHEMA_VERSION };
