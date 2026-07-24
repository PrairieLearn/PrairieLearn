import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentInstanceSharedStateValueSchema,
  type Question,
  type SharedStateObjectValue,
} from '../lib/db-types.js';
import {
  SHARED_STATE_MAX_TOTAL_BYTES_PER_ASSESSMENT_INSTANCE,
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

/**
 * Resolves a question's `sharedStateAccess` list against the course's
 * currently synced shared-state object definitions. Objects that don't
 * (yet) have an "assessment_instance"-scoped revision are silently skipped:
 * this shouldn't happen for a successfully-synced course (sync validates
 * that access lists reference declared objects, and course-instance scope is
 * rejected at sync time), but we don't want a stale in-memory `Question` to
 * crash rendering.
 */
export async function selectSharedStateObjectsForQuestion({
  course_id,
  question,
}: {
  course_id: string;
  question: Question;
}): Promise<Record<string, ResolvedSharedStateObject>> {
  const resolved: Record<string, ResolvedSharedStateObject> = {};
  for (const name of question.shared_state_access) {
    const objectWithRevision = await selectSharedStateObjectWithRevisionByName({
      course_id,
      name,
    });
    if (objectWithRevision?.revision == null) continue;
    if (objectWithRevision.revision.scope !== 'assessment_instance') continue;

    resolved[name] = {
      id: objectWithRevision.id,
      revisionId: objectWithRevision.revision.id,
      properties: objectWithRevision.revision.properties as SharedStateObjectPropertiesJson,
    };
  }
  return resolved;
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
      row != null && row.revision_id === object.revisionId
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
  before: Record<string, SharedStateObjectValue>;
  after: Record<string, SharedStateObjectValue>;
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
        row != null && row.revision_id === object.revisionId
          ? row.data
          : extractSharedStateObjectDefaults(object.properties);
      const merged = { ...base, ...patch };

      const validationErrors = validateSharedStateObjectValueForWrite(merged, object.properties);
      if (validationErrors.length > 0) {
        issues.push(`Shared-state object "${name}": ${validationErrors.join('; ')}`);
        return;
      }

      const { total_bytes: otherObjectsBytes } = await sqldb.queryRow(
        sql.select_other_objects_total_bytes,
        { assessment_instance_id, shared_state_object_id: object.id },
        z.object({ total_bytes: z.number() }),
      );
      const mergedBytes = Buffer.byteLength(JSON.stringify(merged), 'utf8');
      if (otherObjectsBytes + mergedBytes > SHARED_STATE_MAX_TOTAL_BYTES_PER_ASSESSMENT_INSTANCE) {
        issues.push(
          `Shared-state object "${name}": writing this value would bring this assessment instance's total shared-state size to ${otherObjectsBytes + mergedBytes} bytes, which exceeds the limit of ${SHARED_STATE_MAX_TOTAL_BYTES_PER_ASSESSMENT_INSTANCE} bytes`,
        );
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
