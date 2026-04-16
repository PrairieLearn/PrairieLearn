import { randomInt } from 'node:crypto';

import { countBy, difference } from 'es-toolkit';
import { z } from 'zod';

import { AugmentedError } from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import * as Sentry from '@prairielearn/sentry';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../../lib/config.js';
import { CourseInstanceSchema } from '../../lib/db-types.js';
import { type CourseInstanceJson } from '../../schemas/index.js';
import { type CourseData, type CourseInstanceData } from '../course-db.js';
import { isDateInFuture } from '../dates.js';
import * as infofile from '../infofile.js';

const sql = sqldb.loadSqlEquiv(import.meta.filename);

export async function uniqueEnrollmentCode() {
  while (true) {
    const enrollmentCode = generateEnrollmentCode();
    const existingEnrollmentCode = await sqldb.queryOptionalScalar(
      sql.select_existing_enrollment_code,
      { enrollment_code: enrollmentCode },
      z.string(),
    );
    if (existingEnrollmentCode === null) {
      return enrollmentCode;
    }
  }
}

function generateEnrollmentCode() {
  // We exclude O/0 and I/1 because they are easily confused.
  const allowed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const totalChars = 10;
  let raw = '';
  while (raw.length < totalChars) {
    raw += allowed[randomInt(0, allowed.length)];
  }
  return raw;
}

function getParamsForCourseInstance(courseInstance: CourseInstanceJson | null | undefined) {
  if (!courseInstance) return null;

  // It used to be the case that instance access rules could be associated with a
  // particular user role, e.g., Student, TA, or Instructor. Now, all access rules
  // apply only to students. So, we filter out (and ignore) any access rule with a
  // non-empty role that is not Student.
  const accessRules = courseInstance.allowAccess
    ?.filter((accessRule) => accessRule.role == null || accessRule.role === 'Student')
    .map((accessRule) => ({
      uids: accessRule.uids ?? null,
      start_date: accessRule.startDate ?? null,
      end_date: accessRule.endDate ?? null,
      institution: accessRule.institution ?? null,
      comment: accessRule.comment,
    }));

  return {
    uuid: courseInstance.uuid,
    long_name: courseInstance.longName,
    assessments_group_by: courseInstance.groupAssessmentsBy,
    display_timezone: courseInstance.timezone ?? null,
    comment: JSON.stringify(courseInstance.comment),
    modern_publishing: accessRules == null,
    publishing_start_date: courseInstance.publishing?.startDate ?? null,
    publishing_end_date: courseInstance.publishing?.endDate ?? null,
    self_enrollment_enabled: courseInstance.selfEnrollment.enabled,
    self_enrollment_enabled_before_date: courseInstance.selfEnrollment.beforeDate,
    self_enrollment_restrict_to_institution: courseInstance.selfEnrollment.restrictToInstitution,
    self_enrollment_use_enrollment_code: courseInstance.selfEnrollment.useEnrollmentCode,
    share_source_publicly: courseInstance.shareSourcePublicly,
    access_rules: accessRules ?? [],
  };
}

export async function sync(
  courseId: string,
  courseData: CourseData,
): Promise<Record<string, string>> {
  if (config.checkInstitutionsOnSync) {
    // Collect all institutions from course instance access rules.
    const institutions = Object.values(courseData.courseInstances)
      .flatMap(({ courseInstance }) => courseInstance.data?.allowAccess)
      .map((accessRule) => accessRule?.institution)
      .filter((institution) => institution != null);

    // Select only the valid institution names.
    const validInstitutions = await sqldb.queryScalars(
      sql.select_valid_institution_short_names,
      { short_names: Array.from(new Set(institutions)) },
      z.string(),
    );

    const validInstitutionSet = new Set(validInstitutions);

    // This is a special hardcoded value that is always valid.
    validInstitutionSet.add('Any');

    // Add sync errors for invalid institutions.
    Object.values(courseData.courseInstances).forEach(({ courseInstance }) => {
      // Note that we only emit errors for institutions referenced from access
      // rules that will be accessible at some point in the future. This lets
      // us avoid emitting errors for very old, unused course instances.
      const instanceInstitutions = new Set(
        courseInstance.data?.allowAccess
          ?.filter((accessRule) => isDateInFuture(accessRule.endDate))
          .map((accessRule) => accessRule.institution)
          .filter((institution) => institution != null),
      );

      instanceInstitutions.forEach((institution) => {
        if (validInstitutionSet.has(institution)) return;

        infofile.addError(courseInstance, `Institution "${institution}" not found.`);
      });
    });
  }

  return await sqldb.runInTransactionAsync(async () => {
    const courseInstanceIdentityParams = await Promise.all(
      Object.entries(courseData.courseInstances).map(async ([shortName, courseInstanceData]) =>
        JSON.stringify([
          shortName,
          courseInstanceData.courseInstance.uuid,
          // This enrollment code is only used for inserts, and not used on updates
          await uniqueEnrollmentCode(),
        ]),
      ),
    );

    const shortNameToIdMapping = await sqldb.queryScalar(
      sql.sync_course_instances_insert_delete,
      { course_instances_data: courseInstanceIdentityParams, course_id: courseId },
      z.record(z.string(), IdSchema),
    );

    await courseInstanceConsistencyCheck({ courseId, courseInstances: courseData.courseInstances });

    const courseInstanceGeneralParams = Object.entries(courseData.courseInstances).map(
      ([shortName, courseInstanceData]) => {
        const courseInstanceId = shortNameToIdMapping[shortName];
        if (!courseInstanceId) {
          throw new Error(
            `Assertion: course instance with short name "${shortName}" was not synced successfully`,
          );
        }
        const { courseInstance } = courseInstanceData;
        return JSON.stringify([
          courseInstanceId,
          infofile.stringifyErrors(courseInstance),
          infofile.stringifyWarnings(courseInstance),
          getParamsForCourseInstance(courseInstance.data),
        ]);
      },
    );

    await sqldb.execute(sql.sync_course_instances_update, {
      course_instances_data: courseInstanceGeneralParams,
      course_id: courseId,
    });

    return shortNameToIdMapping;
  });
}

/**
 * Perform some internal consistency checks to ensure that the course instances
 * in the database match the course instances in the disk data, before we
 * proceed with updates. We check that the list on both sides are the same, that
 * short names are unique, and that the UUIDs match for each instance.
 */
async function courseInstanceConsistencyCheck({
  courseId,
  courseInstances,
}: {
  courseId: string;
  courseInstances: Record<string, CourseInstanceData>;
}) {
  try {
    const courseInstancesForConsistencyCheck = await sqldb.queryRows(
      sql.select_course_instances_for_consistency_check,
      { course_id: courseId },
      CourseInstanceSchema.pick({ short_name: true, uuid: true }),
    );
    const shortNamesInDb = courseInstancesForConsistencyCheck.map((ci) => ci.short_name);
    const shortNamesInDisk = Object.keys(courseInstances);

    const duplicateShortNames = Object.entries(countBy(shortNamesInDb, (name) => name ?? ''))
      .filter(([, count]) => count > 1)
      .map(([shortName]) => shortName);
    if (duplicateShortNames.length > 0) {
      throw new AugmentedError(
        'Assertion: Duplicate course instance short names found in database',
        { data: { courseId, duplicateShortNames } },
      );
    }

    const dbInstancesNotInDisk = difference(shortNamesInDb, shortNamesInDisk);
    if (dbInstancesNotInDisk.length > 0) {
      throw new AugmentedError(
        'Assertion: Course instances exist in the database that are not in disk data',
        { data: { courseId, dbInstancesNotInDisk } },
      );
    }
    const diskInstancesNotInDb = difference(shortNamesInDisk, shortNamesInDb);
    if (diskInstancesNotInDb.length > 0) {
      throw new AugmentedError(
        'Assertion: Course instances exist in disk data that are not in the database',
        { data: { courseId, diskInstancesNotInDb } },
      );
    }
    const mismatchedInstanceUuids = courseInstancesForConsistencyCheck
      .map((ci) => ({
        ...ci,
        diskUuid: courseInstances[ci.short_name!].courseInstance.uuid,
      }))
      .filter((ci) => ci.diskUuid && ci.diskUuid !== ci.uuid);
    if (mismatchedInstanceUuids.length > 0) {
      throw new AugmentedError(
        'Assertion: Course instances exist where the UUID in the database does not match the UUID in disk data',
        { data: { courseId, mismatchedInstanceUuids } },
      );
    }
  } catch (error) {
    // These validations are meant to catch issues in sync functionality, so we log them to Sentry and then re-throw the error.
    Sentry.captureException(error);
    throw error;
  }
}
