import * as path from 'node:path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { StaffAssessmentModuleSchema } from '../../lib/client/safe-db-types.js';
import { computeScopedJsonHash } from '../../lib/editorUtil.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import { prepareJsonFileEditor } from '../../lib/editors.js';
import { selectAssessmentModulesForCourse } from '../../models/assessment-module.js';
import { type CourseJsonInput } from '../../schemas/infoCourse.js';
import { throwAppError } from '../app-errors.js';

import {
  requireCoursePermissionEdit,
  requireCoursePermissionPreview,
  requireNotExampleCourse,
  t,
} from './init.js';

export interface AssessmentModulesError {
  List: never;
  Save: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

function getCourseContainer(coursePath: string) {
  return {
    rootPath: coursePath,
    invalidRootPaths: [
      path.join(coursePath, '.git'),
      path.join(coursePath, 'questions'),
      path.join(coursePath, 'courseInstances'),
    ],
  };
}

function assessmentModulesScope(json: CourseJsonInput) {
  return json.assessmentModules ?? [];
}

const list = t.procedure
  .use(requireCoursePermissionPreview)
  .output(
    z.object({
      modules: z.array(StaffAssessmentModuleSchema),
      origHash: z.string().nullable(),
    }),
  )
  .query(async (opts) => {
    const { course } = opts.ctx;

    const modules = await selectAssessmentModulesForCourse(course.id);
    const origHash = await computeScopedJsonHash<CourseJsonInput>(
      path.join(course.path, 'infoCourse.json'),
      assessmentModulesScope,
    );

    return {
      modules: modules.map((module) => StaffAssessmentModuleSchema.parse(module)),
      origHash,
    };
  });

const save = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      modules: z.array(
        z.object({
          name: z.string().trim().min(1, 'Module name is required'),
          heading: z.string().trim().min(1, 'Module heading is required'),
          implicit: z.boolean(),
        }),
      ),
      origHash: z.string().nullable(),
    }),
  )
  .output(z.object({ origHash: z.string().nullable() }))
  .mutation(async (opts) => {
    const { course, locals } = opts.ctx;
    const { modules, origHash } = opts.input;

    // Implicit modules are auto-generated during sync (e.g. the "Default" module
    // or modules referenced by an assessment but absent from infoCourse.json), so
    // they're never written back to the file. Editing one in the UI clears its
    // implicit flag, which promotes it to an explicit module here.
    const resolvedModules = modules
      .filter((module) => !module.implicit)
      .map((module) => ({ name: module.name, heading: module.heading }));

    const seenNames = new Set<string>();
    for (const module of resolvedModules) {
      if (seenNames.has(module.name)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Multiple modules have the name "${module.name}". Module names must be unique.`,
        });
      }
      seenNames.add(module.name);
    }

    const prepared = await prepareJsonFileEditor<CourseJsonInput>({
      applyChanges: (jsonContents) => {
        jsonContents.assessmentModules = propertyValueWithDefault(
          jsonContents.assessmentModules,
          resolvedModules,
          (v: any) => !v || v.length === 0,
        );
        return jsonContents;
      },
      jsonPath: path.join(course.path, 'infoCourse.json'),
      container: getCourseContainer(course.path),
      conflictCheck: { origHash, scope: assessmentModulesScope },
      locals,
    });

    if (!prepared.success) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'The assessment modules have been modified since you loaded this page. Please refresh and try again.',
      });
    }

    const serverJob = await prepared.editor.prepareServerJob();
    try {
      await prepared.editor.executeWithServerJob(serverJob);
    } catch {
      throwAppError<AssessmentModulesError['Save']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to save assessment modules',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    return { origHash: prepared.newHash };
  });

export const assessmentModulesRouter = t.router({ list, save });
