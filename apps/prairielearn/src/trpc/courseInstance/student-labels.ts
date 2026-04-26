import * as crypto from 'node:crypto';
import * as path from 'node:path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { StaffStudentLabelSchema } from '../../lib/client/safe-db-types.js';
import { computeScopedJsonHash, saveJsonFile } from '../../lib/editorUtil.js';
import {
  selectEnrollmentsByIdsInCourseInstance,
  selectEnrollmentsByUidsOrPendingUidsInCourseInstance,
} from '../../models/enrollment.js';
import {
  addLabelToEnrollments,
  removeLabelFromEnrollments,
  selectEnrollmentsInStudentLabel,
  selectStudentLabelByUuid,
  selectStudentLabelsInCourseInstance,
} from '../../models/student-label.js';
import {
  MAX_LABEL_UIDS,
  StudentLabelWithUserDataSchema,
} from '../../pages/instructorStudentsLabels/instructorStudentsLabels.types.js';
import { getStudentLabelsWithUserData } from '../../pages/instructorStudentsLabels/queries.js';
import { ColorJsonSchema } from '../../schemas/infoCourse.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';
import { throwAppError } from '../app-errors.js';

import {
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  requireCoursePermissionEdit,
  selectStudentLabelByIdOrNotFound,
  t,
} from './init.js';

export interface StudentLabelError {
  Upsert: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  Destroy: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
}

function getCourseInstanceContainer(coursePath: string, shortName: string) {
  const rootPath = path.join(coursePath, 'courseInstances', shortName);
  return {
    rootPath,
    invalidRootPaths: [path.join(rootPath, 'assessments')],
  };
}

const list = t.procedure
  .use(requireCourseInstancePermissionView)
  .output(
    z.object({
      labels: z.array(StudentLabelWithUserDataSchema),
      origHash: z.string().nullable(),
    }),
  )
  .query(async (opts) => {
    const { course, course_instance } = opts.ctx;
    const labels = await getStudentLabelsWithUserData(course_instance);

    const courseInstanceJsonPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
      'infoCourseInstance.json',
    );
    const origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      courseInstanceJsonPath,
      (json) => json.studentLabels ?? [],
    );

    return { labels, origHash };
  });

const listDefinitions = t.procedure
  .use(requireCourseInstancePermissionView)
  .output(
    z.object({
      labels: z.array(StaffStudentLabelSchema),
      origHash: z.string().nullable(),
    }),
  )
  .query(async (opts) => {
    const { course, course_instance } = opts.ctx;
    const labels = await selectStudentLabelsInCourseInstance(course_instance);

    const courseInstanceJsonPath = path.join(
      course.path,
      'courseInstances',
      course_instance.short_name!,
      'infoCourseInstance.json',
    );
    const origHash = await computeScopedJsonHash<CourseInstanceJsonInput>(
      courseInstanceJsonPath,
      (json) => json.studentLabels ?? [],
    );

    return {
      labels: labels.map((l) => StaffStudentLabelSchema.parse(l)),
      origHash,
    };
  });

const checkUids = t.procedure
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

const upsert = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      labelId: IdSchema.optional(),
      name: z.string().trim().min(1, 'Label name is required').max(255),
      color: ColorJsonSchema,
      uids: z.array(z.string()).max(MAX_LABEL_UIDS).optional(),
      origHash: z.string().nullable(),
    }),
  )
  .mutation(async (opts) => {
    const { course, course_instance, authz_data, locals } = opts.ctx;
    const { labelId, name, color, uids: rawUids, origHash } = opts.input;

    const existingLabel = labelId
      ? await selectStudentLabelByIdOrNotFound({ id: labelId, courseInstance: course_instance })
      : null;

    const labelUuid = existingLabel?.uuid ?? crypto.randomUUID();

    const saveResult = await saveJsonFile<CourseInstanceJsonInput>({
      applyChanges: (jsonContents) => {
        const studentLabels = jsonContents.studentLabels ?? [];

        if (existingLabel) {
          const labelIndex = studentLabels.findIndex((l) => l.uuid === existingLabel.uuid);
          if (labelIndex === -1) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Label not found in course configuration',
            });
          }
          if (studentLabels.some((l, i) => i !== labelIndex && l.name === name)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'A label with this name already exists',
            });
          }
          studentLabels[labelIndex] = { uuid: studentLabels[labelIndex].uuid, name, color };
        } else {
          if (studentLabels.some((l) => l.name === name)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'A label with this name already exists',
            });
          }
          studentLabels.push({ uuid: labelUuid, name, color });
        }

        jsonContents.studentLabels = studentLabels;
        return jsonContents;
      },
      jsonPath: path.join(
        course.path,
        'courseInstances',
        course_instance.short_name!,
        'infoCourseInstance.json',
      ),
      container: getCourseInstanceContainer(course.path, course_instance.short_name!),
      conflictCheck: {
        origHash,
        scope: (json) => json.studentLabels ?? [],
      },
      locals,
    });

    if (!saveResult.success) {
      if (saveResult.reason === 'conflict') {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'The file has been modified since you loaded this page. Please refresh and try again.',
        });
      }
      throwAppError<StudentLabelError>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to save course instance configuration',
        jobSequenceId: saveResult.jobSequenceId,
      });
    }

    if (rawUids === undefined) {
      return { origHash: saveResult.newHash };
    }

    const uids = [...new Set(rawUids)];
    let enrollmentWarning: string | undefined;

    try {
      const updatedLabel = await selectStudentLabelByUuid({
        uuid: labelUuid,
        courseInstance: course_instance,
      });

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

      if (existingLabel) {
        const currentEnrollments = await selectEnrollmentsInStudentLabel(updatedLabel);
        const currentEnrollmentIdSet = new Set(currentEnrollments.map((e) => e.id));
        const desiredEnrollmentIdSet = new Set(desiredEnrollments.map((e) => e.id));

        const toAdd = desiredEnrollments.filter((e) => !currentEnrollmentIdSet.has(e.id));
        const toRemove = currentEnrollments.filter((e) => !desiredEnrollmentIdSet.has(e.id));

        if (toAdd.length > 0 || toRemove.length > 0) {
          await runInTransactionAsync(async () => {
            if (toAdd.length > 0) {
              await addLabelToEnrollments({
                enrollments: toAdd,
                label: updatedLabel,
                authzData: authz_data,
              });
            }
            if (toRemove.length > 0) {
              await removeLabelFromEnrollments({
                enrollments: toRemove,
                label: updatedLabel,
                authzData: authz_data,
              });
            }
          });
        }
      } else if (desiredEnrollments.length > 0) {
        await addLabelToEnrollments({
          enrollments: desiredEnrollments,
          label: updatedLabel,
          authzData: authz_data,
        });
      }
    } catch {
      enrollmentWarning = existingLabel
        ? 'The label was saved, but updating student assignments failed. Edit the label to retry.'
        : 'The label was created, but assigning students failed. Edit the label to retry.';
    }

    return { origHash: saveResult.newHash, enrollmentWarning };
  });

const destroy = t.procedure
  .use(requireCoursePermissionEdit)
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

    const label = await selectStudentLabelByIdOrNotFound({
      id: labelId,
      courseInstance: course_instance,
    });

    const saveResult = await saveJsonFile<CourseInstanceJsonInput>({
      applyChanges: (jsonContents) => {
        const studentLabels = jsonContents.studentLabels ?? [];
        const labelIndex = studentLabels.findIndex((l) => l.uuid === label.uuid);
        if (labelIndex === -1) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Label not found in course configuration',
          });
        }
        studentLabels.splice(labelIndex, 1);
        jsonContents.studentLabels = studentLabels;
        return jsonContents;
      },
      jsonPath: path.join(
        course.path,
        'courseInstances',
        course_instance.short_name!,
        'infoCourseInstance.json',
      ),
      container: getCourseInstanceContainer(course.path, course_instance.short_name!),
      conflictCheck: {
        origHash,
        scope: (json) => json.studentLabels ?? [],
      },
      locals,
    });

    if (!saveResult.success) {
      if (saveResult.reason === 'conflict') {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            'The file has been modified since you loaded this page. Please refresh and try again.',
        });
      }
      throwAppError<StudentLabelError>({
        code: 'SYNC_JOB_FAILED',
        message: 'Failed to save course instance configuration',
        jobSequenceId: saveResult.jobSequenceId,
      });
    }

    return { origHash: saveResult.newHash };
  });

const batchAdd = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      enrollmentIds: z.array(IdSchema).max(MAX_LABEL_UIDS),
      labelId: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const { course_instance, authz_data } = opts.ctx;
    const { enrollmentIds: rawEnrollmentIds, labelId } = opts.input;

    const enrollmentIds = [...new Set(rawEnrollmentIds)];

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

const batchRemove = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      enrollmentIds: z.array(IdSchema).max(MAX_LABEL_UIDS),
      labelId: IdSchema,
    }),
  )
  .mutation(async (opts) => {
    const { course_instance, authz_data } = opts.ctx;
    const { enrollmentIds: rawEnrollmentIds, labelId } = opts.input;

    const enrollmentIds = [...new Set(rawEnrollmentIds)];

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
  list,
  listDefinitions,
  checkUids,
  upsert,
  destroy,
  batchAdd,
  batchRemove,
});
