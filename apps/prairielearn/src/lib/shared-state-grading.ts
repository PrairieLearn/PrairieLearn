import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  type ResolvedSharedStateObject,
  extractSharedStateDefaultsForObjects,
  readSharedStateValuesForAssessmentInstance,
  selectSharedStateObjectsForQuestion,
} from '../models/shared-state-value.js';

import { type Course, type Question, type SharedStateObjectValue } from './db-types.js';
import {
  diffSharedStateObjectValue,
  validateSharedStateObjectValueForWrite,
} from './shared-state.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface SharedStateResolution {
  objects: Record<string, ResolvedSharedStateObject>;
  assessment_instance_id: string | null;
  before: Record<string, SharedStateObjectValue>;
}

/**
 * Resolves the shared-state objects a question can access and reads their
 * current, live value for the assessment instance a variant belongs to. Used
 * before both the `parse` and `grade` phases. A variant with no assessment
 * instance (e.g. an instructor preview) has nothing to read live, but
 * `data["shared_state"]` is still populated with each object's schema
 * defaults — mirroring how `question-variant.ts` seeds `generate`/`prepare`
 * for the same case — rather than an empty object.
 */
export async function resolveSharedStateForPhase({
  question,
  question_course,
  instance_question_id,
}: {
  question: Question;
  question_course: Course;
  instance_question_id: string | null;
}): Promise<SharedStateResolution> {
  const objects = await selectSharedStateObjectsForQuestion({
    course_id: question_course.id,
    question,
  });

  if (Object.keys(objects).length === 0) {
    return { objects, assessment_instance_id: null, before: {} };
  }

  const assessment_instance_id =
    instance_question_id == null
      ? null
      : await sqldb.queryOptionalScalar(
          sql.select_assessment_instance_id_for_instance_question,
          { instance_question_id },
          IdSchema,
        );
  if (assessment_instance_id == null) {
    return {
      objects,
      assessment_instance_id: null,
      before: extractSharedStateDefaultsForObjects(objects),
    };
  }

  const before = await readSharedStateValuesForAssessmentInstance({
    assessment_instance_id,
    objects,
  });
  return { objects, assessment_instance_id, before };
}

/**
 * Validates the property-level patch a question phase produced against each
 * object's schema, merged onto the pre-phase snapshot. This is a cheap
 * pre-check so an invalid write becomes a fatal course issue (and the
 * question is marked broken) before the submission/grading result is
 * persisted, rather than only being caught later when the patch is actually
 * written back to the database.
 */
export function validateSharedStatePatch({
  objects,
  before,
  after,
}: {
  objects: Record<string, ResolvedSharedStateObject>;
  before: Partial<Record<string, SharedStateObjectValue>>;
  after: Partial<Record<string, SharedStateObjectValue>>;
}): string[] {
  const issues: string[] = [];
  for (const [name, object] of Object.entries(objects)) {
    const patch = diffSharedStateObjectValue(before[name] ?? {}, after[name] ?? before[name] ?? {});
    if (Object.keys(patch).length === 0) continue;
    const merged = { ...before[name], ...patch };
    const errors = validateSharedStateObjectValueForWrite(merged, object.properties);
    if (errors.length > 0) {
      issues.push(`Shared-state object "${name}": ${errors.join('; ')}`);
    }
  }
  return issues;
}
