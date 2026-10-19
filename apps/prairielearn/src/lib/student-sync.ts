import { Readable } from 'node:stream';

import { CsvError } from 'csv-parse';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import {
  inviteStudentByUid,
  reenrollEnrollmentFromSync,
  selectOptionalEnrollmentByUid,
} from '../models/enrollment.js';
import {
  addLabelToEnrollment,
  removeLabelFromEnrollment,
  selectStudentLabelsForEnrollment,
} from '../models/student-label.js';
import type { SyncLabelUpdate } from '../pages/instructorStudents/instructorStudents.shared.js';

import type { AuthzDataWithEffectiveUser } from './authz-data-lib.js';
import { createCsvParser } from './csv.js';
import type { CourseInstance, EnumEnrollmentStatus, StudentLabel } from './db-types.js';
import { runWithSharedEnrollmentBarrier } from './enrollment/barrier.js';
import { lockEnrollments } from './enrollment/lock.js';

export async function parseStudentSyncCsv(
  text: string,
  labels: Pick<StudentLabel, 'id' | 'name'>[],
) {
  const labelsByName = new Map(labels.map((label) => [label.name, label.id]));
  const rows = new Map<string, string[] | undefined>();
  let headers: string[] | undefined;
  const parser = createCsvParser(Readable.from([text]), {
    columns: false,
    cast: false,
    info: true,
    relaxColumnCount: false,
  });
  try {
    for await (const record of parser) {
      const { record: row, info } = z
        .object({
          record: z.array(z.string()),
          info: z.object({ lines: z.number() }),
        })
        .parse(record);
      if (!headers) {
        headers = row.map((header) => header.trim().toLowerCase());
        if (
          !headers.includes('uid') ||
          new Set(headers).size !== headers.length ||
          headers.some((header) => header !== 'uid' && header !== 'labels')
        ) {
          throw new HttpStatusError(
            400,
            'Use a uid header and an optional labels header, with no duplicate or extra columns. Separate label names with semicolons in the labels cell.',
          );
        }
        continue;
      }
      const uid = row[headers.indexOf('uid')].trim();
      if (!z.email().safeParse(uid).success) {
        throw new HttpStatusError(
          400,
          `Row ending on line ${info.lines}: enter a valid student UID (email address).`,
        );
      }
      if (rows.has(uid)) {
        throw new HttpStatusError(
          400,
          `Row ending on line ${info.lines}: ${uid} appears more than once. Keep one row per student.`,
        );
      }
      const labelsIndex = headers.indexOf('labels');
      if (labelsIndex === -1) {
        rows.set(uid, undefined);
      } else {
        const names = row[labelsIndex]
          .split(';')
          .map((name) => name.trim())
          .filter(Boolean);
        const labelIds = names.map((name) => {
          const id = labelsByName.get(name);
          if (!id) {
            throw new HttpStatusError(
              400,
              `Row ending on line ${info.lines}: ${uid}: unknown label "${name}". Use an existing label name exactly as shown in this course instance.`,
            );
          }
          return id;
        });
        rows.set(uid, [...new Set(labelIds)]);
      }
      if (rows.size > 5000) {
        throw new HttpStatusError(400, 'Cannot synchronize more than 5,000 students at a time.');
      }
    }
  } catch (error) {
    if (error instanceof CsvError) {
      throw new HttpStatusError(
        400,
        `Invalid CSV near line ${String(error.lines)}. Check the number of columns and quote cells containing commas or quotation marks.`,
        { cause: error },
      );
    }
    throw error;
  }
  if (rows.size === 0) {
    throw new HttpStatusError(400, 'Include at least one student below the CSV header.');
  }
  return rows;
}

export async function applyStudentSyncLabels({
  update,
  courseInstance,
  labelsById,
  authzData,
}: {
  update: SyncLabelUpdate;
  courseInstance: CourseInstance;
  labelsById: Map<string, StudentLabel>;
  authzData: AuthzDataWithEffectiveUser;
}): Promise<EnumEnrollmentStatus | null> {
  // Match enrollment writers' barrier/row-lock order; keep the preview check and all mutations atomic.
  return await runWithSharedEnrollmentBarrier(courseInstance.id, async () => {
    if (update.expected) await lockEnrollments([update.expected.enrollmentId]);
    let enrollment = await selectOptionalEnrollmentByUid({
      uid: update.uid,
      courseInstance,
      authzData,
      requiredRole: ['Student Data Editor'],
    });
    const currentLabels = enrollment ? await selectStudentLabelsForEnrollment(enrollment) : [];
    const currentIds = new Set(currentLabels.map((label) => label.id));
    if (
      enrollment?.id !== update.expected?.enrollmentId ||
      enrollment?.status !== update.expected?.status ||
      currentIds.size !== (update.expected?.labelIds.length ?? 0) ||
      !(update.expected?.labelIds ?? []).every((id) => currentIds.has(id))
    ) {
      throw new HttpStatusError(
        409,
        'This student’s enrollment or labels changed after the preview. Compare the student list again.',
      );
    }
    const previousStatus = enrollment?.status ?? null;
    if (enrollment && ['blocked', 'removed'].includes(enrollment.status)) {
      enrollment = await reenrollEnrollmentFromSync({
        enrollment,
        authzData,
        requiredRole: ['Student Data Editor'],
      });
    } else if (!enrollment || !['invited', 'joined'].includes(enrollment.status)) {
      enrollment = await inviteStudentByUid({
        uid: update.uid,
        courseInstance,
        authzData,
        requiredRole: ['Student Data Editor'],
        actionDetail: 'invited_by_manual_sync',
      });
    }
    const desiredIds = new Set(update.labelIds);
    for (const label of currentLabels) {
      if (!desiredIds.has(label.id)) {
        await removeLabelFromEnrollment({ enrollment, label, authzData });
      }
    }
    for (const id of desiredIds) {
      const label = labelsById.get(id);
      if (!label) {
        throw new HttpStatusError(
          400,
          'A selected label is no longer available. Compare the student list again.',
        );
      }
      if (!currentIds.has(id)) await addLabelToEnrollment({ enrollment, label, authzData });
    }
    return previousStatus;
  });
}
