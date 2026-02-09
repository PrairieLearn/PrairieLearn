import * as path from 'path';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import {
  computeCourseInstanceJsonHash,
  readCourseInstanceJson,
  saveCourseInstanceJson,
} from '../../lib/courseInstanceJson.js';
import { getPaths } from '../../lib/instructorFiles.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { parseUniqueValuesFromString } from '../../lib/string-util.js';
import {
  selectEnrollmentsByIdsInCourseInstance,
  selectUsersAndEnrollmentsByUidsInCourseInstance,
} from '../../models/enrollment.js';
import {
  addEnrollmentsToStudentLabel,
  removeEnrollmentsFromStudentLabel,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelById,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import { ColorJsonSchema } from '../../schemas/infoCourse.js';
import { type StudentLabelJson, StudentLabelJsonSchema } from '../../schemas/infoCourseInstance.js';

import { StudentLabelWithUserDataSchema } from './instructorStudentsLabels.types.js';
import { getStudentLabelsWithUserData } from './queries.js';

const MAX_UIDS = 1000;

const StudentLabelsArraySchema = z.array(StudentLabelJsonSchema);

function parseStudentLabels(courseInstanceJson: Record<string, unknown>): StudentLabelJson[] {
  const result = StudentLabelsArraySchema.safeParse(courseInstanceJson.studentLabels ?? []);
  if (!result.success) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Invalid studentLabels in infoCourseInstance.json',
      cause: result.error,
    });
  }
  return result.data;
}

export function createTRPCContext({ res }: CreateExpressContextOptions) {
  const locals = res.locals as ResLocalsForPage<'course-instance'>;

  return {
    course: locals.course,
    course_instance: locals.course_instance,
    authz_data: locals.authz_data,
    // Store full locals for saveCourseInstanceJson which needs authz_data, course, and user
    locals,
  };
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

/**
 * Middleware that checks if the user has course instance view permission.
 */
const requireCourseInstancePermissionView = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_view) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data viewer)',
    });
  }
  return opts.next();
});

/**
 * Middleware that checks if the user has course instance edit permission.
 * Required for all mutations that modify data.
 */
const requireCourseInstancePermissionEdit = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_edit) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data editor)',
    });
  }
  return opts.next();
});

function requireShortName(shortName: string | null): string {
  if (shortName == null) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Course instance short_name is not available',
    });
  }
  return shortName;
}

const labelsQuery = t.procedure
  .use(requireCourseInstancePermissionView)
  .output(z.array(StudentLabelWithUserDataSchema))
  .query(async (opts) => {
    return await getStudentLabelsWithUserData(opts.ctx.course_instance.id);
  });

const checkUidsQuery = t.procedure
  .use(requireCourseInstancePermissionView)
  .input(z.object({ uids: z.array(z.string()) }))
  .output(z.object({ invalidUids: z.array(z.string()) }))
  .query(async (opts) => {
    const { uids } = opts.input;

    const enrolledUsers = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids,
      courseInstance: opts.ctx.course_instance,
      requiredRole: ['Student Data Viewer'],
      authzData: opts.ctx.authz_data,
    });

    const enrolledUidSet = new Set(enrolledUsers.map((e) => e.user.uid));
    const invalidUids = uids.filter((uid) => !enrolledUidSet.has(uid));

    return { invalidUids };
  });

const createLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      name: z.string().min(1, 'Label name is required').max(255),
      color: ColorJsonSchema,
      uids: z.string().optional().default(''),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, authz_data, locals } = opts.ctx;
    const { name, color, uids: uidsString, origHash } = opts.input;

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      requireShortName(course_instance.short_name),
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const paths = getPaths(undefined, locals);

    // Read current JSON
    const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
    const studentLabels = parseStudentLabels(courseInstanceJson);

    // Check if label name already exists
    if (studentLabels.some((l) => l.name === name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A label with this name already exists',
      });
    }

    // Add new label
    studentLabels.push({ name, color });
    courseInstanceJson.studentLabels = studentLabels;

    // Save using FileModifyEditor
    const saveResult = await saveCourseInstanceJson({
      courseInstanceJson,
      courseInstanceJsonPath,
      paths,
      origHash: origHash ?? '',
      locals,
    });

    if (!saveResult.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: saveResult.error,
        cause: { jobSequenceId: saveResult.jobSequenceId },
      });
    }

    // After sync, add enrollments
    const uids = parseUniqueValuesFromString(uidsString, MAX_UIDS);
    if (uids.length > 0) {
      const enrolledUsers = await selectUsersAndEnrollmentsByUidsInCourseInstance({
        uids,
        courseInstance: course_instance,
        requiredRole: ['Student Data Editor'],
        authzData: authz_data,
      });

      // Get the newly created label from database
      const labels = await selectStudentLabelsInCourseInstance(course_instance);
      const newLabel = labels.find((l) => l.name === name);
      if (!newLabel) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Label saved but not found in database',
        });
      }
      await addEnrollmentsToStudentLabel({
        enrollments: enrolledUsers.map((u) => u.enrollment),
        label: newLabel,
        authzData: authz_data,
      });
    }

    // Return the new origHash for the next operation
    const newHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);
    return { origHash: newHash };
  });

const editLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      labelId: IdSchema,
      name: z.string().min(1, 'Label name is required').max(255),
      oldName: z.string(),
      color: ColorJsonSchema,
      uids: z.string().optional().default(''),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, authz_data, locals } = opts.ctx;
    const { labelId, name, oldName, color, uids: uidsString, origHash } = opts.input;

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      requireShortName(course_instance.short_name),
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const paths = getPaths(undefined, locals);

    await selectStudentLabelById({ id: labelId, courseInstance: course_instance });

    // Read current JSON
    const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
    const studentLabels = parseStudentLabels(courseInstanceJson);

    // Find and update the label
    const labelIndex = studentLabels.findIndex((l) => l.name === oldName);
    if (labelIndex === -1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Label not found in JSON configuration',
      });
    }

    // Check if new name conflicts with another label
    if (name !== oldName && studentLabels.some((l) => l.name === name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A label with this name already exists',
      });
    }

    studentLabels[labelIndex] = { name, color };
    courseInstanceJson.studentLabels = studentLabels;

    // Save using FileModifyEditor
    const saveResult = await saveCourseInstanceJson({
      courseInstanceJson,
      courseInstanceJsonPath,
      paths,
      origHash: origHash ?? '',
      locals,
    });

    if (!saveResult.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: saveResult.error,
        cause: { jobSequenceId: saveResult.jobSequenceId },
      });
    }

    // Update enrollments - get the label by new name after sync
    const labels = await selectStudentLabelsInCourseInstance(course_instance);
    const updatedLabel = labels.find((l) => l.name === name);

    if (!updatedLabel) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Label saved but not found in database',
      });
    }

    // Get current enrollments
    const currentEnrollments = await selectEnrollmentsInStudentLabel(updatedLabel);
    const currentEnrollmentIdSet = new Set(currentEnrollments.map((e) => e.id));

    // Parse UIDs and get desired enrollments
    const uids = parseUniqueValuesFromString(uidsString, MAX_UIDS);
    const desiredEnrollments =
      uids.length > 0
        ? (
            await selectUsersAndEnrollmentsByUidsInCourseInstance({
              uids,
              courseInstance: course_instance,
              requiredRole: ['Student Data Editor'],
              authzData: authz_data,
            })
          ).map((u) => u.enrollment)
        : [];
    const desiredEnrollmentIdSet = new Set(desiredEnrollments.map((e) => e.id));

    // Add new enrollments
    const toAdd = desiredEnrollments.filter((e) => !currentEnrollmentIdSet.has(e.id));
    if (toAdd.length > 0) {
      await addEnrollmentsToStudentLabel({
        enrollments: toAdd,
        label: updatedLabel,
        authzData: authz_data,
      });
    }

    // Remove old enrollments
    const toRemove = currentEnrollments.filter((e) => !desiredEnrollmentIdSet.has(e.id));
    if (toRemove.length > 0) {
      await removeEnrollmentsFromStudentLabel({
        enrollments: toRemove,
        label: updatedLabel,
        authzData: authz_data,
      });
    }

    // Return the new origHash for the next operation
    const newHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);
    return { origHash: newHash };
  });

const deleteLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      labelId: IdSchema,
      labelName: z.string().min(1),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, locals } = opts.ctx;
    const { labelId, labelName, origHash } = opts.input;

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      requireShortName(course_instance.short_name),
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const paths = getPaths(undefined, locals);

    await selectStudentLabelById({ id: labelId, courseInstance: course_instance });

    // Read current JSON
    const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
    const studentLabels = parseStudentLabels(courseInstanceJson);

    // Remove the label
    const labelIndex = studentLabels.findIndex((l) => l.name === labelName);
    if (labelIndex === -1) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Label not found in course configuration',
      });
    }

    studentLabels.splice(labelIndex, 1);
    courseInstanceJson.studentLabels = studentLabels;

    // Save using FileModifyEditor
    const saveResult = await saveCourseInstanceJson({
      courseInstanceJson,
      courseInstanceJsonPath,
      paths,
      origHash: origHash ?? '',
      locals,
    });

    if (!saveResult.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: saveResult.error,
        cause: { jobSequenceId: saveResult.jobSequenceId },
      });
    }

    // Return the new origHash for the next operation
    const newHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);
    return { origHash: newHash };
  });

const batchAddLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      enrollmentIds: z.array(IdSchema).max(MAX_UIDS),
      labelId: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const { course_instance, authz_data } = opts.ctx;
    const { enrollmentIds, labelId } = opts.input;

    const label = await selectStudentLabelById({ id: labelId, courseInstance: course_instance });

    const enrollments = await selectEnrollmentsByIdsInCourseInstance({
      ids: enrollmentIds,
      courseInstance: course_instance,
      requiredRole: ['Student Data Editor'],
      authzData: authz_data,
    });

    const addedEnrollments = await addEnrollmentsToStudentLabel({
      enrollments,
      label,
      authzData: authz_data,
    });
    const added = addedEnrollments.length;
    const alreadyHaveLabel = enrollments.length - added;

    return { added, alreadyHaveLabel };
  });

const batchRemoveLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      enrollmentIds: z.array(IdSchema).max(MAX_UIDS),
      labelId: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const { course_instance, authz_data } = opts.ctx;
    const { enrollmentIds, labelId } = opts.input;

    const label = await selectStudentLabelById({ id: labelId, courseInstance: course_instance });

    const enrollments = await selectEnrollmentsByIdsInCourseInstance({
      ids: enrollmentIds,
      courseInstance: course_instance,
      requiredRole: ['Student Data Editor'],
      authzData: authz_data,
    });

    const removed = await removeEnrollmentsFromStudentLabel({
      enrollments,
      label,
      authzData: authz_data,
    });

    return { removed };
  });

export const studentLabelsRouter = t.router({
  labels: labelsQuery,
  checkUids: checkUidsQuery,
  createLabel: createLabelMutation,
  editLabel: editLabelMutation,
  deleteLabel: deleteLabelMutation,
  batchAddLabel: batchAddLabelMutation,
  batchRemoveLabel: batchRemoveLabelMutation,
});

export type StudentLabelsRouter = typeof studentLabelsRouter;
