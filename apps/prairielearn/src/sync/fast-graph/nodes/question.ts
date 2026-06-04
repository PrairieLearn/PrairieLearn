import type { Course } from '../../../lib/db-types.js';
import { selectAssessmentsReferencingQuestions } from '../../../models/assessment.js';
import { getFastSyncStrategy } from '../../fast/index.js';
import { selectMatchingQuestion, syncQuestionJson } from '../../fast/question.js';
import type { DirtyNode, MatchResult, SyncNode, SyncOutcome } from '../engine.js';

interface QuestionPayload {
  pathPrefix: string;
}

/**
 * Question node. Reuses the per-case safe-update logic from `sync/fast`, but
 * wires the grading-method change (which `sync/fast` bails on) through the graph
 * so the dependent assessments get resynced instead of forcing a full sync.
 */
export const questionNode: SyncNode = {
  type: 'Question',
  topoRank: 10,

  async match(_course: Course, changedFiles: string[]): Promise<MatchResult> {
    const strategy = getFastSyncStrategy(changedFiles);
    if (strategy?.type !== 'Question') return { nodes: [], claimedFiles: [] };

    // A Question strategy is only returned when every changed file lives under
    // `questions/`, so it's safe to claim all of them.
    return {
      nodes: [
        {
          type: 'Question',
          key: strategy.pathPrefix,
          payload: { pathPrefix: strategy.pathPrefix },
        },
      ],
      claimedFiles: changedFiles,
    };
  },

  async dependents(course: Course, nodes: DirtyNode[]): Promise<DirtyNode[]> {
    const dependents: DirtyNode[] = [];
    for (const node of nodes) {
      const { pathPrefix } = node.payload as QuestionPayload;
      const question = await selectMatchingQuestion(pathPrefix);
      // A brand-new question can't be referenced by any assessment yet.
      if (!question?.id) continue;

      const assessments = await selectAssessmentsReferencingQuestions({
        course_id: course.id,
        question_ids: [question.id],
      });
      for (const assessment of assessments) {
        dependents.push({
          type: 'Assessment',
          key: `${assessment.assessment_id} ${question.id}`,
          payload: { assessmentId: assessment.assessment_id, questionId: question.id },
        });
      }
    }
    return dependents;
  },

  async sync(course: Course, node: DirtyNode): Promise<SyncOutcome> {
    const { pathPrefix } = node.payload as QuestionPayload;
    const question = await syncQuestionJson(course, pathPrefix, { skipGradingMethodBail: true });
    if (!question) return { status: 'fallback' };

    return {
      status: 'ok',
      chunks: question.qid ? [{ type: 'question', questionName: question.qid }] : [],
    };
  },
};
