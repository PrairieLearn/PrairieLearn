import * as path from 'path';

import { TRPCError } from '@trpc/server';
import fs from 'fs-extra';
import { z } from 'zod';

import { saveJsonFile } from '../../lib/editors.js';
import { getCourseContainer } from '../../lib/instructorFiles.js';
import { validateSharedStateObjectProperties } from '../../lib/shared-state.js';
import {
  type CourseJsonInput,
  SHARED_STATE_OBJECT_NAME_REGEXP,
  type SharedStateObjectJson,
  type SharedStateObjectPropertiesJson,
} from '../../schemas/infoCourse.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, requireNotExampleCourse, t } from './init.js';

export interface SharedStateError {
  SaveSharedState:
    | { code: 'DUPLICATE_NAME'; name: string }
    | { code: 'INVALID_PROPERTIES'; name: string; errors: string[] }
    | { code: 'CONFLICT' }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

const SharedStatePropertyInputSchema = z.object({
  name: z.string().min(1, 'Property name is required'),
  type: z.enum(['string', 'number', 'boolean']),
  default: z.string().min(1, 'Default value is required'),
  enum: z.array(z.string()).default([]),
});

const SharedStateObjectInputSchema = z.object({
  name: z
    .string()
    .regex(
      SHARED_STATE_OBJECT_NAME_REGEXP,
      'Names must start with a letter and contain only letters, numbers, underscores, and hyphens.',
    ),
  dataVersion: z.number().int().min(1),
  properties: z.array(SharedStatePropertyInputSchema),
});

/**
 * Converts the editor's string-valued form rows (every input in the grid is a
 * plain text/select control) into the typed `default`/`enum` values that
 * `infoCourse.json` stores, the same conversion `instructorQuestionSettings.tsx`
 * does for question preferences.
 */
function buildSharedStateObject(
  input: z.infer<typeof SharedStateObjectInputSchema>,
): SharedStateObjectJson {
  const properties: SharedStateObjectPropertiesJson = {};
  for (const prop of input.properties) {
    const parsedDefault =
      prop.type === 'number'
        ? Number(prop.default)
        : prop.type === 'boolean'
          ? prop.default === 'true'
          : prop.default;
    const parsedEnum =
      prop.enum.length > 0
        ? prop.type === 'number'
          ? prop.enum.map(Number)
          : prop.enum
        : undefined;

    properties[prop.name] = {
      type: prop.type,
      default: parsedDefault,
      ...(parsedEnum ? { enum: parsedEnum } : {}),
    };
  }

  const errors = validateSharedStateObjectProperties(properties);
  if (errors.length > 0) {
    throwAppError<SharedStateError['SaveSharedState']>({
      code: 'INVALID_PROPERTIES',
      message: `Shared-data object "${input.name}": ${errors.join('; ')}`,
      name: input.name,
      errors,
    });
  }

  return { scope: 'assessmentInstance', dataVersion: input.dataVersion, properties };
}

const saveSharedState = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      objects: z.array(SharedStateObjectInputSchema),
      origHash: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const names = new Set<string>();
    const nextSharedState: Record<string, SharedStateObjectJson> = {};
    for (const obj of input.objects) {
      if (names.has(obj.name)) {
        throwAppError<SharedStateError['SaveSharedState']>({
          code: 'DUPLICATE_NAME',
          message: `A shared-data object named "${obj.name}" already exists.`,
          name: obj.name,
        });
      }
      names.add(obj.name);
      nextSharedState[obj.name] = buildSharedStateObject(obj);
    }

    const infoCoursePath = path.join(ctx.course.path, 'infoCourse.json');
    if (!(await fs.pathExists(infoCoursePath))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'infoCourse.json does not exist' });
    }

    const result = await saveJsonFile<CourseJsonInput>({
      jsonPath: infoCoursePath,
      conflictCheck: {
        origHash: input.origHash,
        scope: (courseInfo) => courseInfo.sharedState ?? {},
      },
      applyChanges: (courseInfo) => {
        if (Object.keys(nextSharedState).length > 0) {
          courseInfo.sharedState = nextSharedState;
        } else {
          delete courseInfo.sharedState;
        }
        return courseInfo;
      },
      locals: ctx.locals,
      container: getCourseContainer(ctx.course.path),
    });

    if (!result.success) {
      if (result.reason === 'conflict') {
        throwAppError<SharedStateError['SaveSharedState']>({
          code: 'CONFLICT',
          message: 'Shared data was modified elsewhere. Reload the page and try again.',
        });
      }
      throwAppError<SharedStateError['SaveSharedState']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to save shared data',
        jobSequenceId: result.jobSequenceId,
      });
    }

    return { origHash: result.newHash };
  });

export const sharedStateRouter = t.router({
  saveSharedState,
});
