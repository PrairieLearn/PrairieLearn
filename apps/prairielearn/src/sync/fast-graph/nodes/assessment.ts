import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import type { Course } from '../../../lib/db-types.js';
import type { DirtyNode, MatchResult, SyncNode, SyncOutcome } from '../engine.js';

const sql = loadSqlEquiv(import.meta.url);

interface AssessmentPayload {
  assessmentId: string;
  questionId: string;
}

/**
 * Assessment node. In this POC it's only reached as a ripple from a question
 * whose grading method changed: it recomputes the manual/auto point split on the
 * affected assessment question. Direct edits to an assessment's JSON aren't
 * claimed by any node, so they fall back to a full sync.
 */
export const assessmentNode: SyncNode = {
  type: 'Assessment',
  topoRank: 20,

  async match(_course: Course, _changedFiles: string[]): Promise<MatchResult> {
    return { nodes: [], claimedFiles: [] };
  },

  async dependents(_course: Course, _nodes: DirtyNode[]): Promise<DirtyNode[]> {
    return [];
  },

  async sync(_course: Course, node: DirtyNode): Promise<SyncOutcome> {
    const { assessmentId, questionId } = node.payload as AssessmentPayload;
    await execute(sql.recompute_question_points_split, {
      assessment_id: assessmentId,
      question_id: questionId,
    });
    return { status: 'ok' };
  },
};
