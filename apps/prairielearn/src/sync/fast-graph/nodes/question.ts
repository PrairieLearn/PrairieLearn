import type { ChangedFiles } from '../../../lib/chunks.js';
import type { Course } from '../../../lib/db-types.js';
import { selectAssessmentsReferencingQuestions } from '../../../models/assessment.js';
import { getFastSyncStrategy } from '../../fast/index.js';
import {
  selectMatchingQuestion,
  syncQuestionJson,
  syncQuestionRename,
} from '../../fast/question.js';
import type { DirtyNode, MatchResult, SyncNode, SyncOutcome } from '../engine.js';

type QuestionPayload =
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
 * renames (a moved `info.json`). For any change it ripples to the assessments
 * that reference the question; the engine re-syncs each from disk, which is how
 * a grading-method change or a rename's rewritten assessment JSON gets applied.
 */
export const questionNode: SyncNode = {
  type: 'Question',
  topoRank: 10,

  async match(_course: Course, changed: ChangedFiles): Promise<MatchResult> {
    const nodes: DirtyNode[] = [];
    const claimedFiles: string[] = [];

    // Upserts: added/modified/deleted files under a single question.
    const upsertFiles = [...changed.modified, ...changed.deleted];
    const strategy = getFastSyncStrategy(upsertFiles);
    if (strategy?.type === 'Question') {
      nodes.push({
        type: 'Question',
        key: `upsert ${strategy.pathPrefix}`,
        payload: { kind: 'upsert', pathPrefix: strategy.pathPrefix },
      });
      claimedFiles.push(...upsertFiles);
    }

    // Renames: a moved `info.json` under `questions/`.
    const renames = changed.renamed.flatMap(({ from, to }) => {
      const oldQid = qidFromInfoPath(from);
      const newQid = qidFromInfoPath(to);
      return oldQid !== null && newQid !== null ? [{ oldQid, newQid }] : [];
    });
    for (const { oldQid, newQid } of renames) {
      nodes.push({
        type: 'Question',
        key: `rename ${newQid}`,
        payload: { kind: 'rename', oldQid, newQid },
      });
    }
    // Claim every renamed file that belongs to a renamed question.
    for (const { from, to } of changed.renamed) {
      const belongs = renames.some(
        ({ oldQid, newQid }) =>
          isUnder(from, `questions/${oldQid}`) && isUnder(to, `questions/${newQid}`),
      );
      if (belongs) claimedFiles.push(from, to);
    }

    return { nodes, claimedFiles };
  },

  async dependents(course: Course, nodes: DirtyNode[]): Promise<DirtyNode[]> {
    // Resolve each dirty question to its id (by its *current* QID), then mark
    // the assessments that reference it dirty so they get re-synced from disk.
    const questionIds: string[] = [];
    for (const node of nodes) {
      const payload = node.payload as QuestionPayload;
      const currentPrefix =
        payload.kind === 'upsert' ? payload.pathPrefix : `questions/${payload.oldQid}`;
      const question = await selectMatchingQuestion(currentPrefix);
      if (question?.id) questionIds.push(question.id);
    }
    if (questionIds.length === 0) return [];

    const assessments = await selectAssessmentsReferencingQuestions({
      course_id: course.id,
      question_ids: questionIds,
    });
    return assessments.map((a) => ({
      type: 'Assessment',
      key: `${a.course_instance_short_name}/${a.assessment_directory}`,
      payload: {
        courseInstanceShortName: a.course_instance_short_name,
        tid: a.assessment_directory,
      },
    }));
  },

  async sync(course: Course, node: DirtyNode): Promise<SyncOutcome> {
    const payload = node.payload as QuestionPayload;
    const question =
      payload.kind === 'upsert'
        ? await syncQuestionJson(course, payload.pathPrefix)
        : await syncQuestionRename(course, payload.oldQid, payload.newQid);
    if (!question) return { status: 'fallback' };

    return {
      status: 'ok',
      chunks: question.qid ? [{ type: 'question', questionName: question.qid }] : [],
    };
  },
};
