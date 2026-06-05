import type { ChangedFiles } from '../../lib/chunks.js';
import type { Course } from '../../lib/db-types.js';
import { selectAssessmentsReferencingQuestions } from '../../models/assessment.js';
import { selectMatchingQuestion } from '../fast/question.js';

import { type FastSyncResult, type SyncGraph, runFastSync } from './engine.js';
import { type AssessmentPayload, assessmentNode } from './nodes/assessment.js';
import { type QuestionPayload, questionNode } from './nodes/question.js';

/**
 * Resolves the assessments that reference a batch of dirty questions, so they
 * get re-synced from disk after the questions do. This is the one place that
 * knows about the Question → Assessment relationship; neither node imports the
 * other. It returns Assessment *payloads* — the assessment node owns their
 * identity (`assessmentNode.key`), so the key format lives in exactly one place.
 */
async function assessmentsReferencingQuestions(
  course: Course,
  sources: unknown[],
): Promise<AssessmentPayload[]> {
  const questionIds: string[] = [];
  for (const payload of sources as QuestionPayload[]) {
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
  return assessments.map((assessment) => ({
    courseInstanceShortName: assessment.course_instance_short_name,
    tid: assessment.assessment_directory,
  }));
}

/**
 * The sync dependency graph: node types plus the directed edges between them.
 * Adding a fast-sync case means adding a {@link SyncNode} and declaring its
 * edges here — the engine and the other nodes are untouched, and the sync
 * ordering falls out of a topological sort over these edges.
 */
export const GRAPH: SyncGraph = {
  nodes: [questionNode, assessmentNode],
  edges: [
    // A change to a question (points, grading method, rename, ...) flows into the
    // synced rows of every assessment that references it.
    { from: 'Question', to: 'Assessment', resolve: assessmentsReferencingQuestions },
  ],
};

/**
 * Attempts a graph-based fast sync. Returns `{ ok: false }` if any part of the
 * change couldn't be fast-synced, in which case the caller must fall back to a
 * full sync.
 */
export async function attemptGraphFastSync(
  course: Course,
  changed: ChangedFiles,
): Promise<FastSyncResult> {
  return await runFastSync(course, changed, GRAPH);
}
