import * as path from 'path';

import { TRPCError } from '@trpc/server';

import { analyzeCourseInstanceAssessments } from '../../lib/assessment-access-control/migration.js';
import { type FileModifyEditor, MultiEditor, prepareJsonFileEditor } from '../../lib/editors.js';
import {
  selectNonPublicAssessmentsInCourseInstance,
  selectNonPublicQuestionsInAssessment,
} from '../../lib/sharing-validation.js';
import { type AssessmentJsonInput } from '../../schemas/infoAssessment.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';
import { throwAppError } from '../app-errors.js';

import { requireCoursePermissionEdit, requireEnhancedAccessControl, t } from './init.js';

export interface InstanceAdminSettingsError {
  ShareCourseInstanceSourcePubliclyBulk:
    | {
        code: 'ASSESSMENT_HAS_NON_PUBLIC_QUESTIONS';
        assessments: { tid: string; nonPublicQids: string[] }[];
      }
    | { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

const analyzeAccessControl = t.procedure
  .use(requireEnhancedAccessControl)
  .use(requireCoursePermissionEdit)
  .query(async (opts) => {
    const shortName = opts.ctx.course_instance.short_name;
    if (!shortName) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'This course instance does not have a short name, so access control rules cannot be analyzed.',
      });
    }
    const courseInstancePath = path.join(opts.ctx.course.path, 'courseInstances', shortName);
    return analyzeCourseInstanceAssessments(courseInstancePath);
  });

/**
 * Bulk-share every non-publicly-shared assessment in this course instance, and
 * flip the course instance's own `shareSourcePublicly` to true. All file edits
 * are bundled into a single `MultiEditor` so they commit and sync atomically.
 *
 * Stays "one level at a time": if any of the assessments to share still has
 * unshared questions of its own, the mutation aborts with a structured error
 * pointing the user at those assessments. They must drill into each one and
 * use that assessment's bulk-share first.
 */
const shareSourcePubliclyBulk = t.procedure
  .use(requireCoursePermissionEdit)
  .mutation(async ({ ctx }) => {
    const { course, course_instance, locals } = ctx;

    if (!locals.question_sharing_enabled) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Access denied (feature not available).',
      });
    }
    if (course.example_course) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Cannot make changes to example course.',
      });
    }
    if (course_instance.share_source_publicly) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This course instance is already publicly shared.',
      });
    }

    const nonPublicAssessments = await selectNonPublicAssessmentsInCourseInstance({
      course_instance_id: course_instance.id,
    });

    // Pre-check: every assessment we're about to share must itself have no
    // non-public questions. If any does, abort and tell the user to share
    // that assessment's questions first via the assessment-level button.
    const blockers: { tid: string; nonPublicQids: string[] }[] = [];
    for (const a of nonPublicAssessments) {
      const qs = await selectNonPublicQuestionsInAssessment({ assessment_id: a.id });
      if (qs.length > 0) {
        blockers.push({ tid: a.tid, nonPublicQids: qs.map((q) => q.qid) });
      }
    }
    if (blockers.length > 0) {
      throwAppError<InstanceAdminSettingsError['ShareCourseInstanceSourcePubliclyBulk']>({
        code: 'ASSESSMENT_HAS_NON_PUBLIC_QUESTIONS',
        message:
          'Some assessments still have non-publicly-shared questions. Share each of those assessments individually first.',
        assessments: blockers,
      });
    }

    const editors: FileModifyEditor[] = [];
    for (const a of nonPublicAssessments) {
      const assessmentDir = path.join(
        course.path,
        'courseInstances',
        course_instance.short_name,
        'assessments',
        a.tid,
      );
      const prepared = await prepareJsonFileEditor<AssessmentJsonInput>({
        applyChanges: (contents) => {
          contents.shareSourcePublicly = true;
          return contents;
        },
        jsonPath: path.join(assessmentDir, 'infoAssessment.json'),
        conflictCheck: { origHash: null, scope: (j) => j },
        locals,
        container: { rootPath: assessmentDir, invalidRootPaths: [] },
      });
      if (prepared.success) editors.push(prepared.editor);
    }

    const courseInstanceDir = path.join(course.path, 'courseInstances', course_instance.short_name);
    const preparedCi = await prepareJsonFileEditor<CourseInstanceJsonInput>({
      applyChanges: (contents) => {
        contents.shareSourcePublicly = true;
        return contents;
      },
      jsonPath: path.join(courseInstanceDir, 'infoCourseInstance.json'),
      // No scoped conflict check; see assessment-settings bulk-share for
      // rationale.
      conflictCheck: { origHash: null, scope: (j) => j },
      locals,
      container: { rootPath: courseInstanceDir, invalidRootPaths: [] },
    });
    if (!preparedCi.success) {
      // Unreachable: `success: false` only happens when `origHash` is set.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to prepare course instance edit.',
      });
    }
    editors.push(preparedCi.editor);

    const multi = new MultiEditor(
      {
        locals,
        description: `Bulk-share assessments for course instance: ${course_instance.short_name}`,
      },
      editors,
    );
    const serverJob = await multi.prepareServerJob();
    try {
      await multi.executeWithServerJob(serverJob);
    } catch {
      throwAppError<InstanceAdminSettingsError['ShareCourseInstanceSourcePubliclyBulk']>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to share course instance publicly',
        jobSequenceId: serverJob.jobSequenceId,
      });
    }

    return { origHash: preparedCi.newHash };
  });

export const instanceAdminSettingsRouter = t.router({
  analyzeAccessControl,
  shareSourcePubliclyBulk,
});
