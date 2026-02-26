import * as crypto from 'node:crypto';
import * as path from 'node:path';

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
import {
  selectEnrollmentsByIdsInCourseInstance,
  selectEnrollmentsByUidsOrPendingUidsInCourseInstance,
} from '../../models/enrollment.js';
import {
  addLabelToEnrollments,
  removeLabelFromEnrollments,
  selectEnrollmentsInStudentLabel,
  selectOptionalStudentLabelById,
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
  ...args: Parameters<typeof selectOptionalStudentLabelById>
) {
  try {
    const label = await selectOptionalStudentLabelById(...args);
    if (label == null) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Label not found',
      });
    }
    return label;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof HttpStatusError) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: error.message,
        cause: error,
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to look up label',
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

interface SaveJobErrorCause {
  jobSequenceId: string;
}

function isSaveJobErrorCause(cause: unknown): cause is SaveJobErrorCause {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'jobSequenceId' in cause &&
    typeof (cause as SaveJobErrorCause).jobSequenceId === 'string'
  );
}

export const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        jobSequenceId: isSaveJobErrorCause(error.cause) ? error.cause.jobSequenceId : undefined,
      },
    };
  },
});

const requireCourseInstancePermissionView = t.middleware(async (opts) => {
  if (!opts.ctx.authz_data.has_course_instance_permission_view) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Access denied (must be a student data viewer)',
    });
  }
  return opts.next();
});

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
  .output(
    z.object({
      labels: z.array(StudentLabelWithUserDataSchema),
      origHash: z.string().nullable(),
    }),
  )
  .query(async (opts) => {
    const { course, course_instance } = opts.ctx;
    const labels = await getStudentLabelsWithUserData(course_instance.id);

    const courseInstancePath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
    );
    const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
    const origHash = await computeCourseInstanceJsonHash(courseInstanceJsonPath);

    return { labels, origHash };
  });

const checkUidsQuery = t.procedure
  .use(requireCourseInstancePermissionView)
  .input(z.object({ uids: z.array(z.string()).max(MAX_LABEL_UIDS) }))
  .output(z.object({ unenrolledUids: z.array(z.string()) }))
  .query(async (opts) => {
    const { uids } = opts.input;

    const enrolledRecords = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
      uids,
      courseInstance: opts.ctx.course_instance,
      requiredRole: ['Student Data Viewer'],
      authzData: opts.ctx.authz_data,
    });

    const enrolledUidSet = new Set(enrolledRecords.map((e) => e.uid));
    const unenrolledUids = uids.filter((uid) => !enrolledUidSet.has(uid));

    return { unenrolledUids };
  });

const createLabelMutation = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      name: z.string().min(1, 'Label name is required').max(255),
      color: ColorJsonSchema,
      uids: z.array(z.string()).max(MAX_LABEL_UIDS).default([]),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, authz_data, locals } = opts.ctx;
    const { name, color, uids: rawUids, origHash } = opts.input;

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
    // but without the requested student assignments.
    const uids = [...new Set(rawUids)];
    if (uids.length > 0) {
      const enrolledRecords = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
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
        enrollments: enrolledRecords.map((r) => r.enrollment),
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
      uids: z.array(z.string()).max(MAX_LABEL_UIDS).default([]),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, authz_data, locals } = opts.ctx;
    const { labelId, name, color, uids: rawUids, origHash } = opts.input;

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

    const uids = [...new Set(rawUids)];
    const desiredEnrollments =
      uids.length > 0
        ? (
            await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
              uids,
              courseInstance: course_instance,
              requiredRole: ['Student Data Editor'],
              authzData: authz_data,
            })
          ).map((r) => r.enrollment)
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

    const notFound = enrollmentIds.length - enrollments.length;

    const addedEnrollments = await addLabelToEnrollments({
      enrollments,
      label,
      authzData: authz_data,
    });
    const added = addedEnrollments.length;
    const alreadyHaveLabel = enrollments.length - added;

    return { added, alreadyHaveLabel, notFound };
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

    const notFound = enrollmentIds.length - enrollments.length;

    const removedEnrollments = await removeLabelFromEnrollments({
      enrollments,
      label,
      authzData: authz_data,
    });
    const removed = removedEnrollments.length;
    const didNotHaveLabel = enrollments.length - removed;

    return { removed, didNotHaveLabel, notFound };
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
