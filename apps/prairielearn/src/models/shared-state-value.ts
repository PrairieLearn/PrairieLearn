import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  AssessmentInstanceSharedStateValueSchema,
  type Course,
  type Question,
  type SharedStateObjectValue,
  UserSharedStateValueSchema,
} from '../lib/db-types.js';
import {
  diffSharedStateObjectValue,
  extractSharedStateObjectDefaults,
  normalizeSharedStateObjectValueForRead,
  validateSharedStateObjectValueForWrite,
} from '../lib/shared-state.js';
import type { SharedStateObjectPropertiesJson } from '../schemas/infoCourse.js';

import { selectSharedStateObjectWithRevisionByName } from './shared-state-object.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface ResolvedSharedStateObject {
  id: string;
  revisionId: string;
  properties: SharedStateObjectPropertiesJson;
}

export async function selectSharedStateObjectsForQuestion({
  course_id,
  question,
}: {
  course_id: string;
  question: Question;
}): Promise<Record<string, ResolvedSharedStateObject>> {
  const resolved: Record<string, ResolvedSharedStateObject> = {};
  for (const [localName, objectName] of Object.entries(question.shared_state_access)) {
    const objectWithRevision = await selectSharedStateObjectWithRevisionByName({
      course_id,
      name: objectName,
    });
    if (objectWithRevision?.revision == null) continue;
    if (objectWithRevision.revision.scope !== 'assessment_instance') continue;

    resolved[localName] = {
      id: objectWithRevision.id,
      revisionId: objectWithRevision.revision.id,
      properties: objectWithRevision.revision.properties,
    };
  }
  return resolved;
}

export function extractSharedStateDefaultsForObjects(
  objects: Record<string, ResolvedSharedStateObject>,
): Record<string, SharedStateObjectValue> {
  return Object.fromEntries(
    Object.entries(objects).map(([name, object]) => [
      name,
      extractSharedStateObjectDefaults(object.properties),
    ]),
  );
}

/**
 * Reads the current, schema-normalized value of each given object for an
 * assessment instance. If an object has never been written for this
 * instance, or was written under a since-retired revision (a `dataVersion`
 * bump), this returns the current revision's defaults instead.
 */
export async function readSharedStateValuesForAssessmentInstance({
  assessment_instance_id,
  objects,
}: {
  assessment_instance_id: string;
  objects: Record<string, ResolvedSharedStateObject>;
}): Promise<Record<string, SharedStateObjectValue>> {
  const values: Record<string, SharedStateObjectValue> = {};
  for (const [name, object] of Object.entries(objects)) {
    const row = await sqldb.queryOptionalRow(
      sql.select_value,
      { assessment_instance_id, shared_state_object_id: object.id },
      AssessmentInstanceSharedStateValueSchema,
    );
    const base =
      row?.revision_id === object.revisionId
        ? row.data
        : extractSharedStateObjectDefaults(object.properties);
    values[name] = normalizeSharedStateObjectValueForRead(base, object.properties);
  }
  return values;
}

/**
 * Persists the property-level changes a question phase made to each shared
 * object it can access. For each object, this locks the object's row for
 * this assessment instance, merges the phase's patch onto whatever the
 * freshest stored value is (so a concurrent, disjoint change from a sibling
 * question survives), strictly validates the merged result, and writes it
 * back — all within one transaction per object. Objects with no observed
 * change are left untouched.
 *
 * Returns a course-issue message for each object whose patch failed
 * validation (e.g. wrong type, value outside enum, or over the size limit);
 * such objects are left unwritten.
 */
export async function writeSharedStateValuesForAssessmentInstance({
  assessment_instance_id,
  objects,
  before,
  after,
}: {
  assessment_instance_id: string;
  objects: Record<string, ResolvedSharedStateObject>;
  before: Partial<Record<string, SharedStateObjectValue>>;
  after: Partial<Record<string, SharedStateObjectValue>>;
}): Promise<{ issues: string[] }> {
  const issues: string[] = [];

  for (const [name, object] of Object.entries(objects)) {
    const patch = diffSharedStateObjectValue(before[name] ?? {}, after[name] ?? before[name] ?? {});
    if (Object.keys(patch).length === 0) continue;

    await sqldb.runInTransactionAsync(async () => {
      const row = await sqldb.queryOptionalRow(
        sql.select_value_for_update,
        { assessment_instance_id, shared_state_object_id: object.id },
        AssessmentInstanceSharedStateValueSchema,
      );
      const base =
        row?.revision_id === object.revisionId
          ? row.data
          : extractSharedStateObjectDefaults(object.properties);
      const merged = { ...base, ...patch };

      const validationErrors = validateSharedStateObjectValueForWrite(merged, object.properties);
      if (validationErrors.length > 0) {
        issues.push(`Shared-state object "${name}": ${validationErrors.join('; ')}`);
        return;
      }

      await sqldb.queryRow(
        sql.upsert_value,
        {
          assessment_instance_id,
          shared_state_object_id: object.id,
          revision_id: object.revisionId,
          data: JSON.stringify(merged),
        },
        AssessmentInstanceSharedStateValueSchema,
      );
    });
  }

  return { issues };
}

/**
 * Reads the current, schema-normalized value of each given object for a
 * user. This is the preview-mode counterpart to
 * `readSharedStateValuesForAssessmentInstance`, used when a variant has no
 * assessment instance (e.g. an instructor or public question preview) so
 * that shared state can still persist across "New variant" clicks for the
 * user previewing the question.
 */
export async function readSharedStateValuesForUser({
  user_id,
  objects,
}: {
  user_id: string;
  objects: Record<string, ResolvedSharedStateObject>;
}): Promise<Record<string, SharedStateObjectValue>> {
  const values: Record<string, SharedStateObjectValue> = {};
  for (const [name, object] of Object.entries(objects)) {
    const row = await sqldb.queryOptionalRow(
      sql.select_user_value,
      { user_id, shared_state_object_id: object.id },
      UserSharedStateValueSchema,
    );
    const base =
      row?.revision_id === object.revisionId
        ? row.data
        : extractSharedStateObjectDefaults(object.properties);
    values[name] = normalizeSharedStateObjectValueForRead(base, object.properties);
  }
  return values;
}

/**
 * The preview-mode counterpart to
 * `writeSharedStateValuesForAssessmentInstance`, persisting a phase's patch
 * per-user instead of per-assessment-instance.
 */
export async function writeSharedStateValuesForUser({
  user_id,
  objects,
  before,
  after,
}: {
  user_id: string;
  objects: Record<string, ResolvedSharedStateObject>;
  before: Partial<Record<string, SharedStateObjectValue>>;
  after: Partial<Record<string, SharedStateObjectValue>>;
}): Promise<{ issues: string[] }> {
  const issues: string[] = [];

  for (const [name, object] of Object.entries(objects)) {
    const patch = diffSharedStateObjectValue(before[name] ?? {}, after[name] ?? before[name] ?? {});
    if (Object.keys(patch).length === 0) continue;

    await sqldb.runInTransactionAsync(async () => {
      const row = await sqldb.queryOptionalRow(
        sql.select_user_value_for_update,
        { user_id, shared_state_object_id: object.id },
        UserSharedStateValueSchema,
      );
      const base =
        row?.revision_id === object.revisionId
          ? row.data
          : extractSharedStateObjectDefaults(object.properties);
      const merged = { ...base, ...patch };

      const validationErrors = validateSharedStateObjectValueForWrite(merged, object.properties);
      if (validationErrors.length > 0) {
        issues.push(`Shared-state object "${name}": ${validationErrors.join('; ')}`);
        return;
      }

      await sqldb.queryRow(
        sql.upsert_user_value,
        {
          user_id,
          shared_state_object_id: object.id,
          revision_id: object.revisionId,
          data: JSON.stringify(merged),
        },
        UserSharedStateValueSchema,
      );
    });
  }

  return { issues };
}

export interface SharedStateResolution {
  objects: Record<string, ResolvedSharedStateObject>;
  assessment_instance_id: string | null;
  /**
   * The user to persist preview-mode shared state for, when this variant
   * has no assessment instance. Null whenever `assessment_instance_id` is
   * set, or when there's no user to scope a preview write to (e.g. a group
   * variant with no assessment instance).
   */
  user_id: string | null;
  before: Record<string, SharedStateObjectValue>;
}

export async function resolveSharedStateForPhase({
  question,
  question_course,
  instance_question_id,
  user_id,
}: {
  question: Question;
  question_course: Course;
  instance_question_id: string | null;
  user_id: string | null;
}): Promise<SharedStateResolution> {
  const objects = await selectSharedStateObjectsForQuestion({
    course_id: question_course.id,
    question,
  });

  if (Object.keys(objects).length === 0) {
    return { objects, assessment_instance_id: null, user_id: null, before: {} };
  }

  const assessment_instance_id =
    instance_question_id == null
      ? null
      : await sqldb.queryOptionalScalar(
          sql.select_assessment_instance_id_for_instance_question,
          { instance_question_id },
          IdSchema,
        );
  if (assessment_instance_id != null) {
    const before = await readSharedStateValuesForAssessmentInstance({
      assessment_instance_id,
      objects,
    });
    return { objects, assessment_instance_id, user_id: null, before };
  }

  if (user_id != null) {
    const before = await readSharedStateValuesForUser({ user_id, objects });
    return { objects, assessment_instance_id: null, user_id, before };
  }

  return {
    objects,
    assessment_instance_id: null,
    user_id: null,
    before: extractSharedStateDefaultsForObjects(objects),
  };
}

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
