import { type ServerJob } from '../../../lib/server-jobs.js';

import { classifyCasesAgainstVerdicts } from './classify.js';
import { type LoadedEval } from './manifest.js';
import { latestSnapshotsPerModel, listSnapshotsForEval } from './snapshot.js';
import { type ModelRunSummary, renderModelRunStatsFromSnapshot, reportRunStats } from './stats.js';
import { type VerdictEntry, buildVerdictMap, loadVerdictsFromCsvs } from './verdicts.js';

/**
 * Re-renders the same per-(eval × model) detail blocks + cross-model tables
 * the live grading run produced, but using:
 *   - persisted snapshots in `<eval>/runs/*.json` (verdict-independent — AI
 *     cases, cost, timing)
 *   - the seed verdicts persisted inside each snapshot (from
 *     `submissions.csv`)
 *   - fresh `<eval>/verdicts/*.csv` (including the CSV that was just
 *     uploaded)
 *
 * Each eval keeps only the latest snapshot per model, so re-uploading
 * verdicts always re-scores the most recent benchmark.
 */
export async function recomputeStatsFromSnapshots({
  evals,
  job,
}: {
  evals: LoadedEval[];
  job: ServerJob;
}): Promise<void> {
  const summaries: ModelRunSummary[] = [];
  const verdictFilesByEval = new Map<string, Map<string, number>>();
  let totalEvalsWithSnapshots = 0;

  for (const loaded of evals) {
    const snapshots = await listSnapshotsForEval({
      evalAbsoluteDir: loaded.absoluteDir,
      warn: (m) => job.warn(m),
    });
    const matching = snapshots.filter((s) => s.eval_id === loaded.entry.id);
    if (matching.length === 0) {
      job.info(
        `  ${loaded.entry.id}: no snapshots in runs/ — skipping recompute (run the eval first).`,
      );
      continue;
    }
    totalEvalsWithSnapshots += 1;

    // Seed verdicts come from `submissions.csv` and don't change across
    // model runs of the same eval; any snapshot will have the same payload.
    // Use the most-recent one so we follow the freshest known ground truth
    // if the submissions CSV was edited mid-experiment.
    const seedSource = matching[matching.length - 1];
    const seedEntries: VerdictEntry[] = seedSource.seed_verdicts.map((s) => ({
      case_id: s.case_id,
      eval_id: loaded.entry.id,
      submission_identifier: s.submission_identifier,
      rubric_descriptions: s.rubric_descriptions,
      verdict: 'correct',
      source: 'submissions-csv',
      annotator: null,
      timestamp: null,
      notes: null,
    }));

    const csvEntries = await loadVerdictsFromCsvs(loaded, job);
    const verdictMap = buildVerdictMap([...seedEntries, ...csvEntries]);
    job.info(
      `  ${loaded.entry.id}: ${seedEntries.length} seed verdict(s), ${csvEntries.length} CSV verdict(s).`,
    );

    if (csvEntries.length > 0) {
      const filenames = new Map<string, number>();
      for (const e of csvEntries) {
        const filename = e.source.startsWith('csv:') ? e.source.slice(4) : e.source;
        filenames.set(filename, (filenames.get(filename) ?? 0) + 1);
      }
      verdictFilesByEval.set(loaded.entry.id, filenames);
    }

    const latest = latestSnapshotsPerModel(matching);
    for (const snap of latest) {
      const classified = classifyCasesAgainstVerdicts({
        cases: snap.cases,
        verdictMap,
      });
      summaries.push(renderModelRunStatsFromSnapshot({ snapshot: snap, classified, job }));
    }
  }

  if (summaries.length === 0) {
    job.info('');
    job.info(
      'No snapshots found across any eval — nothing to recompute. Run the eval to generate snapshots.',
    );
    return;
  }

  job.info('');
  job.info(
    `Recomputed stats from ${summaries.length} snapshot(s) across ${totalEvalsWithSnapshots} eval(s).`,
  );

  reportRunStats({ summaries, verdictFilesByEval, job });
}
