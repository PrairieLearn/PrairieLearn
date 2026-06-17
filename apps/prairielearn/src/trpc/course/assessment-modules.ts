import * as path from 'node:path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { DEFAULT_ASSESSMENT_MODULE_NAME } from '../../lib/assessment-modules.shared.js';
import { computeScopedJsonHash } from '../../lib/editorUtil.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  AssessmentModuleRenameEditor,
  MultiEditor,
  prepareJsonFileEditor,
} from '../../lib/editors.js';
import { getCourseContainer } from '../../lib/instructorFiles.js';
import {
  AssessmentModuleWithAssessmentsSchema,
  selectAssessmentModulesForCourse,
  selectAssessmentModulesWithAssessmentsForCourse,
} from '../../models/assessment-module.js';
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

function assessmentModulesScope(json: CourseJsonInput) {
  return json.assessmentModules ?? [];
}

const list = t.procedure
  .use(requireCoursePermissionPreview)
  .output(
    z.object({
      modules: z.array(AssessmentModuleWithAssessmentsSchema),
      origHash: z.string().nullable(),
    }),
  )
  .query(async (opts) => {
    const { course } = opts.ctx;

    const modules = await selectAssessmentModulesWithAssessmentsForCourse(course.id);
    const origHash = await computeScopedJsonHash<CourseJsonInput>(
      path.join(course.path, 'infoCourse.json'),
      assessmentModulesScope,
    );

    return { modules, origHash };
  });

const save = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireNotExampleCourse)
  .input(
    z.object({
      modules: z.array(
        z.object({
          id: z.string().nullable(),
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

    // Compare the submitted modules against the current database state to find
    // modules that were renamed or deleted, so the assessments that reference
    // them can be updated to stay consistent.
    const currentModules = await selectAssessmentModulesForCourse(course.id);
    const currentById = new Map(currentModules.map((module) => [module.id, module]));
    const submittedIds = new Set(modules.map((module) => module.id).filter((id) => id !== null));
    const submittedNames = new Set(modules.map((module) => module.name));

    // A submitted row that maps to an existing module whose name changed is a
    // rename: referencing assessments must point at the new name (`newName`).
    const rewrites: { oldName: string; newName: string | null }[] = [];
    for (const module of modules) {
      if (module.id === null) continue;
      const existing = currentById.get(module.id);
      if (!existing || existing.name === DEFAULT_ASSESSMENT_MODULE_NAME) continue;
      if (existing.name !== module.name) {
        rewrites.push({ oldName: existing.name, newName: module.name });
      }
    }

    // An existing module that's no longer present in the submitted list (by id
    // and name) is deleted: its assessments are reassigned to the Default module
    // by removing the `module` field from each one (a null `newName`). Checking
    // both id and name avoids treating a rename as a delete.
    for (const module of currentModules) {
      if (
        module.name !== DEFAULT_ASSESSMENT_MODULE_NAME &&
        !submittedIds.has(module.id) &&
        !submittedNames.has(module.name)
      ) {
        rewrites.push({ oldName: module.name, newName: null });
      }
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

    const editor =
      rewrites.length === 0
        ? prepared.editor
        : new MultiEditor({ locals, description: 'Update assessment modules' }, [
            new AssessmentModuleRenameEditor({ locals, renames: rewrites }),
            prepared.editor,
          ]);

    const serverJob = await editor.prepareServerJob();
    try {
      await editor.executeWithServerJob(serverJob);
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
