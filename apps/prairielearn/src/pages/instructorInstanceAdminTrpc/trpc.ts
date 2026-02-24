import * as crypto from 'node:crypto';
import * as path from 'path';

import { TRPCError, initTRPC } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
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
  addLabelToEnrollments,
  removeLabelFromEnrollments,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelById,
  selectStudentLabelByUuid,
} from '../../models/student-label.js';
import { ColorJsonSchema } from '../../schemas/infoCourse.js';
import { type StudentLabelJson, StudentLabelJsonSchema } from '../../schemas/infoCourseInstance.js';
import {
  MAX_LABEL_UIDS,
  StudentLabelWithUserDataSchema,
} from '../instructorStudentsLabels/instructorStudentsLabels.types.js';
import { getStudentLabelsWithUserData } from '../instructorStudentsLabels/queries.js';

const StudentLabelsArraySchema = z.array(StudentLabelJsonSchema);

async function selectStudentLabelByIdOrNotFound(
  ...args: Parameters<typeof selectStudentLabelById>
) {
  try {
    return await selectStudentLabelById(...args);
  } catch (error) {
    if (error instanceof HttpStatusError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
        cause: error,
      });
    }
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Label not found',
      cause: error,
    });
  }
}

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

const labelsQuery = t.procedure
  .use(requireCourseInstancePermissionView)
  .output(z.array(StudentLabelWithUserDataSchema))
  .query(async (opts) => {
    return await getStudentLabelsWithUserData(opts.ctx.course_instance.id);
  });

const checkUidsQuery = t.procedure
  .use(requireCourseInstancePermissionView)
  .input(z.object({ uids: z.array(z.string()).max(MAX_LABEL_UIDS) }))
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
      course_instance.short_name!,
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const paths = getPaths(undefined, locals);

    const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
    const studentLabels = parseStudentLabels(courseInstanceJson);

    if (studentLabels.some((l) => l.name === name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A label with this name already exists',
      });
    }

    const newUuid = crypto.randomUUID();
    studentLabels.push({ uuid: newUuid, name, color });
    courseInstanceJson.studentLabels = studentLabels;

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

    // If enrollment assignment fails below, the label will exist (from the sync)
    // but without the requested student assignments. The user will see the error.
    const uids = parseUniqueValuesFromString(uidsString, MAX_LABEL_UIDS);
    if (uids.length > 0) {
      const enrolledUsers = await selectUsersAndEnrollmentsByUidsInCourseInstance({
        uids,
        courseInstance: course_instance,
        requiredRole: ['Student Data Editor'],
        authzData: authz_data,
      });

      const newLabel = await selectStudentLabelByUuid({
        uuid: newUuid,
        courseInstance: course_instance,
      });
      await addLabelToEnrollments({
        enrollments: enrolledUsers.map((u) => u.enrollment),
        label: newLabel,
        authzData: authz_data,
      });
    }

    const newHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);
    return { origHash: newHash };
  });

const editLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      labelId: IdSchema,
      name: z.string().min(1, 'Label name is required').max(255),
      color: ColorJsonSchema,
      uids: z.string().optional().default(''),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, authz_data, locals } = opts.ctx;
    const { labelId, name, color, uids: uidsString, origHash } = opts.input;

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const paths = getPaths(undefined, locals);

    const label = await selectStudentLabelByIdOrNotFound({
      id: labelId,
      courseInstance: course_instance,
    });

    const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
    const studentLabels = parseStudentLabels(courseInstanceJson);

    const labelIndex = studentLabels.findIndex((l) => l.uuid === label.uuid);
    if (labelIndex === -1) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Label not found in JSON configuration',
      });
    }

    if (name !== label.name && studentLabels.some((l) => l.name === name)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'A label with this name already exists',
      });
    }

    studentLabels[labelIndex] = { uuid: studentLabels[labelIndex].uuid, name, color };
    courseInstanceJson.studentLabels = studentLabels;

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

    const updatedLabel = await selectStudentLabelByUuid({
      uuid: label.uuid,
      courseInstance: course_instance,
    });

    const currentEnrollments = await selectEnrollmentsInStudentLabel(updatedLabel);
    const currentEnrollmentIdSet = new Set(currentEnrollments.map((e) => e.id));

    // Full reconciliation: the provided UIDs become the complete enrollment set.
    const uids = parseUniqueValuesFromString(uidsString, MAX_LABEL_UIDS);
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

    const toAdd = desiredEnrollments.filter((e) => !currentEnrollmentIdSet.has(e.id));
    if (toAdd.length > 0) {
      await addLabelToEnrollments({
        enrollments: toAdd,
        label: updatedLabel,
        authzData: authz_data,
      });
    }

    const toRemove = currentEnrollments.filter((e) => !desiredEnrollmentIdSet.has(e.id));
    if (toRemove.length > 0) {
      await removeLabelFromEnrollments({
        enrollments: toRemove,
        label: updatedLabel,
        authzData: authz_data,
      });
    }

    const newHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);
    return { origHash: newHash };
  });

const deleteLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      labelId: IdSchema,
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, locals } = opts.ctx;
    const { labelId, origHash } = opts.input;

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const paths = getPaths(undefined, locals);

    const label = await selectStudentLabelByIdOrNotFound({
      id: labelId,
      courseInstance: course_instance,
    });

    const courseInstanceJson = await readCourseInstanceJson(courseInstancePath);
    const studentLabels = parseStudentLabels(courseInstanceJson);

    const labelIndex = studentLabels.findIndex((l) => l.uuid === label.uuid);
    if (labelIndex === -1) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Label not found in course configuration',
      });
    }

    studentLabels.splice(labelIndex, 1);
    courseInstanceJson.studentLabels = studentLabels;

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

    const newHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);
    return { origHash: newHash };
  });

const batchAddLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      enrollmentIds: z.array(IdSchema).max(MAX_LABEL_UIDS),
      labelId: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const { course_instance, authz_data } = opts.ctx;
    const { enrollmentIds, labelId } = opts.input;

    const label = await selectStudentLabelByIdOrNotFound({
      id: labelId,
      courseInstance: course_instance,
    });

    const enrollments = await selectEnrollmentsByIdsInCourseInstance({
      ids: enrollmentIds,
      courseInstance: course_instance,
      requiredRole: ['Student Data Editor'],
      authzData: authz_data,
    });

    const addedEnrollments = await addLabelToEnrollments({
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
      enrollmentIds: z.array(IdSchema).max(MAX_LABEL_UIDS),
      labelId: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const { course_instance, authz_data } = opts.ctx;
    const { enrollmentIds, labelId } = opts.input;

    const label = await selectStudentLabelByIdOrNotFound({
      id: labelId,
      courseInstance: course_instance,
    });

    const enrollments = await selectEnrollmentsByIdsInCourseInstance({
      ids: enrollmentIds,
      courseInstance: course_instance,
      requiredRole: ['Student Data Editor'],
      authzData: authz_data,
    });

    const removedEnrollments = await removeLabelFromEnrollments({
      enrollments,
      label,
      authzData: authz_data,
    });
    const removed = removedEnrollments.length;
    const didNotHaveLabel = enrollments.length - removed;

    return { removed, didNotHaveLabel };
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
