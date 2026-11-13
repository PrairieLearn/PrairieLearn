import { isEqual } from 'es-toolkit';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { SharedStateObjectRevisionSchema, SharedStateObjectSchema } from '../lib/db-types.js';
import {
  classifySharedStateObjectPropertiesChange,
  validateSharedStateObjectProperties,
} from '../lib/shared-state.js';
import type { SharedStateObjectPropertiesJson } from '../schemas/infoCourse.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

export interface SharedStateObjectDefinition {
  uuid: string;
  scope: 'assessmentInstance' | 'courseInstance';
  dataVersion: number;
  properties: SharedStateObjectPropertiesJson;
}

const SharedStateObjectStateSchema = z.object({
  current_data_version: z.number().nullable(),
  current_properties: z.record(z.string(), z.any()).nullable(),
  current_scope: z.enum(['assessment_instance', 'course_instance']).nullable(),
  max_data_version: z.number().nullable(),
  object_id: z.string(),
});

const SharedStateObjectWithRevisionSchema = SharedStateObjectSchema.extend({
  revision: SharedStateObjectRevisionSchema.nullable(),
});
export type SharedStateObjectWithRevision = z.infer<typeof SharedStateObjectWithRevisionSchema>;

/**
 * Looks up a shared-state object and its currently active revision by name
 * within a course. Used at runtime to resolve which course objects a
 * question's `sharedStateAccess` bindings refer to.
 */
export async function selectSharedStateObjectWithRevisionByName({
  course_id,
  name,
}: {
  course_id: string;
  name: string;
}): Promise<SharedStateObjectWithRevision | null> {
  return await sqldb.queryOptionalRow(
    sql.select_object_with_revision_by_name,
    { course_id, name },
    SharedStateObjectWithRevisionSchema,
  );
}

/**
 * Syncs the course's authored shared-state object definitions into the
 * database. For each object, this either reuses the current revision
 * (nothing changed), creates a new revision under the same author-controlled
 * `dataVersion` (a compatible change), or creates a fresh revision under an
 * increased `dataVersion` (an intentional reset). A breaking change without a
 * `dataVersion` increase, or a `dataVersion` that decreases or repeats a
 * value already used and retired, is reported as a sync error instead of
 * being applied.
 */
export async function syncSharedStateObjectsForCourse(
  course_id: string,
  definitions: Record<string, SharedStateObjectDefinition>,
): Promise<{ errorsByName: Record<string, string[]> }> {
  const errorsByName: Record<string, string[]> = {};

  for (const [name, definition] of Object.entries(definitions)) {
    const errors: string[] = validateSharedStateObjectProperties(definition.properties);

    const scope: 'assessment_instance' | 'course_instance' =
      definition.scope === 'assessmentInstance' ? 'assessment_instance' : 'course_instance';
    if (scope === 'course_instance') {
      errors.push(
        'scope "courseInstance" is not yet supported; only "assessmentInstance" is currently available.',
      );
    }

    if (errors.length === 0) {
      await sqldb.runInTransactionAsync(async () => {
        const matchingObjects = await sqldb.queryRows(
          sql.select_objects_by_uuid_or_name,
          { course_id, name, uuid: definition.uuid },
          SharedStateObjectSchema,
        );
        if (matchingObjects.length > 1) {
          errors.push(
            `name "${name}" and UUID "${definition.uuid}" match different existing shared-state objects.`,
          );
          return;
        }

        const object =
          matchingObjects.length === 0
            ? await sqldb.queryRow(
                sql.insert_object,
                { course_id, name, uuid: definition.uuid },
                SharedStateObjectSchema,
              )
            : await sqldb.queryRow(
                sql.update_object_identity,
                { object_id: matchingObjects[0].id, name, uuid: definition.uuid },
                SharedStateObjectSchema,
              );
        const state = await sqldb.queryOptionalRow(
          sql.select_object_state,
          { object_id: object.id },
          SharedStateObjectStateSchema,
        );

        const unchanged =
          state?.current_data_version === definition.dataVersion &&
          state.current_scope === scope &&
          isEqual(state.current_properties, definition.properties);
        if (unchanged) return;

        const maxDataVersion = state?.max_data_version ?? 0;
        if (definition.dataVersion < maxDataVersion) {
          errors.push(
            `dataVersion ${definition.dataVersion} has already been used and retired for this object (highest seen: ${maxDataVersion}); data versions must not decrease or be reused.`,
          );
          return;
        }

        if (
          state?.current_data_version != null &&
          definition.dataVersion === state.current_data_version
        ) {
          if (scope !== state.current_scope) {
            errors.push('changing "scope" requires increasing "dataVersion".');
            return;
          }
          const { compatible, reasons } = classifySharedStateObjectPropertiesChange(
            state.current_properties as SharedStateObjectPropertiesJson,
            definition.properties,
          );
          if (!compatible) {
            errors.push(
              `incompatible change to "properties" without increasing "dataVersion": ${reasons.join('; ')}`,
            );
            return;
          }
        }

        const revision = await sqldb.queryRow(
          sql.insert_revision,
          {
            shared_state_object_id: object.id,
            data_version: definition.dataVersion,
            scope,
            properties: JSON.stringify(definition.properties),
          },
          SharedStateObjectRevisionSchema,
        );
        await sqldb.execute(sql.update_object_current_revision, {
          object_id: object.id,
          revision_id: revision.id,
        });
      });
    }

    if (errors.length > 0) {
      errorsByName[name] = errors;
    }
  }

  return { errorsByName };
}
