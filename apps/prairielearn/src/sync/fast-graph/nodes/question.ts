import type { ChangedFiles } from '../../../lib/chunks.js';
import type { Course } from '../../../lib/db-types.js';
import { getFastSyncStrategy } from '../../fast/index.js';
import { syncQuestionJson, syncQuestionRename } from '../../fast/question.js';
import type { MatchResult, SyncNode, SyncOutcome } from '../engine.js';

export type QuestionPayload =
  | { kind: 'upsert'; pathPrefix: string }
  | { kind: 'rename'; oldQid: string; newQid: string };

/** Returns the QID for a `questions/<qid>/info.json` path, or null otherwise. */
function qidFromInfoPath(file: string): string | null {
  const prefix = 'questions/';
  const suffix = '/info.json';
  if (!file.startsWith(prefix) || !file.endsWith(suffix)) return null;
  const qid = file.slice(prefix.length, -suffix.length);
  return qid.length > 0 ? qid : null;
}

const isUnder = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);

/**
 * Question node. Handles both upserts (create/update from changed files) and
 * renames (a moved `info.json`). Each `sync` re-derives the question from disk;
 * the Question → Assessment edge (declared in the graph) ripples a change to the
 * assessments that reference it, so a grading-method change or a rename's
 * rewritten assessment JSON gets applied without this node knowing about
 * assessments at all.
 */
export const questionNode: SyncNode = {
  type: 'Question',

  key(payload): string {
    const data = payload as QuestionPayload;
    return data.kind === 'upsert' ? `upsert ${data.pathPrefix}` : `rename ${data.newQid}`;
  },

  async match(_course: Course, changed: ChangedFiles): Promise<MatchResult> {
    const payloads: QuestionPayload[] = [];
    const claimedFiles: string[] = [];

    // Upserts: added/modified/deleted files under a single question.
    const upsertFiles = [...changed.modified, ...changed.deleted];
    const strategy = getFastSyncStrategy(upsertFiles);
    if (strategy?.type === 'Question') {
      payloads.push({ kind: 'upsert', pathPrefix: strategy.pathPrefix });
      claimedFiles.push(...upsertFiles);
    }

    // Renames: a moved `info.json` under `questions/`.
    const renames = changed.renamed.flatMap(({ from, to }) => {
      const oldQid = qidFromInfoPath(from);
      const newQid = qidFromInfoPath(to);
      return oldQid !== null && newQid !== null ? [{ oldQid, newQid }] : [];
    });
    for (const { oldQid, newQid } of renames) {
      payloads.push({ kind: 'rename', oldQid, newQid });
    }
    // Claim every renamed file that belongs to a renamed question.
    for (const { from, to } of changed.renamed) {
      const belongs = renames.some(
        ({ oldQid, newQid }) =>
          isUnder(from, `questions/${oldQid}`) && isUnder(to, `questions/${newQid}`),
      );
      if (belongs) claimedFiles.push(from, to);
    }

    return { payloads, claimedFiles };
  },

  async sync(course: Course, payload: unknown): Promise<SyncOutcome> {
    const data = payload as QuestionPayload;
    const question =
      data.kind === 'upsert'
        ? await syncQuestionJson(course, data.pathPrefix)
        : await syncQuestionRename(course, data.oldQid, data.newQid);
    if (!question) return { status: 'fallback' };

    return {
      status: 'ok',
      chunks: question.qid ? [{ type: 'question', questionName: question.qid }] : [],
    };
  },
};
