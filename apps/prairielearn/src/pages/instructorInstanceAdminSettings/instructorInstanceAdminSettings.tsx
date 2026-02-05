import * as path from 'path';

import { Temporal } from '@js-temporal/polyfill';
import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { DeleteCourseInstanceModal } from '../../components/DeleteCourseInstanceModal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getSelfEnrollmentLinkUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { EnumCourseInstanceRoleSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  CourseInstanceCopyEditor,
  CourseInstanceDeleteEditor,
  CourseInstanceRenameEditor,
  FileModifyEditor,
  MultiEditor,
  getOriginalHash,
} from '../../lib/editors.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { validateShortName } from '../../lib/short-name.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { getCanonicalHost } from '../../lib/url.js';
import { selectCourseInstanceByUuid } from '../../models/course-instances.js';
import { insertCourseInstancePermissions } from '../../models/course-permissions.js';
import type { CourseInstanceJsonInput } from '../../schemas/index.js';
import { uniqueEnrollmentCode } from '../../sync/fromDisk/courseInstances.js';

import { InstructorInstanceAdminSettings } from './instructorInstanceAdminSettings.html.js';
import { SettingsFormBodySchema } from './instructorInstanceAdminSettings.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const {
      course_instance: courseInstance,
      course,
      institution,
      authz_data,
      urlPrefix,
      navPage,
      __csrf_token,
      is_administrator: isAdministrator,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const names = await sqldb.queryRows(
      sql.select_names,
      { course_id: course.id },
      z.object({ short_name: z.string(), long_name: z.string().nullable() }),
    );
    const enrollmentCount = await sqldb.queryRow(
      sql.select_enrollment_count,
      { course_instance_id: courseInstance.id },
      z.number(),
    );
    const host = getCanonicalHost(req);
    const studentLink = new URL(`/pl/course_instance/${courseInstance.id}`, host).href;
    const publicLink = new URL(`/pl/public/course_instance/${courseInstance.id}/assessments`, host)
      .href;

    const selfEnrollLink = new URL(
      getSelfEnrollmentLinkUrl({
        courseInstanceId: courseInstance.id,
        enrollmentCode: courseInstance.enrollment_code,
      }),
      host,
    ).href;
    const availableTimezones = await getCanonicalTimezones([courseInstance.display_timezone]);

    const infoCourseInstancePath = path.join(
      'courseInstances',
      courseInstance.short_name,
      'infoCourseInstance.json',
    );
    const fullInfoCourseInstancePath = path.join(course.path, infoCourseInstancePath);
    const origHash = (await getOriginalHash(fullInfoCourseInstancePath)) ?? '';

    const instanceGHLink = courseRepoContentUrl(
      course,
      `courseInstances/${courseInstance.short_name}`,
    );

    const canEdit = authz_data.has_course_permission_edit && !course.example_course;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Settings',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'settings',
        },
        content: (
          <>
            <Hydrate>
              <InstructorInstanceAdminSettings
                csrfToken={__csrf_token}
                urlPrefix={urlPrefix}
                navPage={navPage}
                canEdit={canEdit}
                course={course}
                courseInstance={courseInstance}
                institution={institution}
                names={names}
                availableTimezones={availableTimezones}
                origHash={origHash}
                instanceGHLink={instanceGHLink}
                studentLink={studentLink}
                publicLink={publicLink}
                selfEnrollLink={selfEnrollLink}
                infoCourseInstancePath={infoCourseInstancePath}
                isDevMode={config.devMode}
                isAdministrator={isAdministrator}
              />
            </Hydrate>
            <Hydrate>
              <DeleteCourseInstanceModal
                shortName={courseInstance.short_name}
                enrolledCount={enrollmentCount}
                csrfToken={__csrf_token}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const {
      course_instance: courseInstance,
      course,
      urlPrefix,
      authz_data: authzData,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    if (req.body.__action === 'copy_course_instance') {
      const {
        short_name,
        long_name,
        start_date,
        end_date,
        self_enrollment_enabled,
        self_enrollment_use_enrollment_code,
        course_instance_permission,
      } = z
        .object({
          short_name: z.string().trim(),
          long_name: z.string().trim(),
          start_date: z.string(),
          end_date: z.string(),
          self_enrollment_enabled: z.boolean(),
          self_enrollment_use_enrollment_code: z.boolean(),
          course_instance_permission: EnumCourseInstanceRoleSchema.optional().default('None'),
        })
        .parse(req.body);

      if (!short_name) {
        throw new error.HttpStatusError(400, 'Short name is required');
      }
      if (!long_name) {
        throw new error.HttpStatusError(400, 'Long name is required');
      }

      const shortNameValidation = validateShortName(short_name);
      if (!shortNameValidation.valid) {
        throw new error.HttpStatusError(400, `Short name ${shortNameValidation.lowercaseMessage}`);
      }

      const existingNames = await sqldb.queryRows(
        sql.select_names,
        { course_id: course.id },
        z.object({ short_name: z.string(), long_name: z.string().nullable() }),
      );
      const existingShortNames = existingNames.map((name) => name.short_name.toLowerCase());
      const existingLongNames = existingNames
        .map((name) => name.long_name?.toLowerCase())
        .filter((name) => name != null);

      if (existingShortNames.includes(short_name.toLowerCase())) {
        throw new error.HttpStatusError(
          400,
          'A course instance with this short name already exists',
        );
      }

      if (existingLongNames.includes(long_name.toLowerCase())) {
        throw new error.HttpStatusError(
          400,
          'A course instance with this long name already exists',
        );
      }

      const updatedCourseInstance = {
        ...courseInstance,
        short_name,
        long_name,
      };

      const startDate = start_date.length > 0 ? start_date : undefined;
      const endDate = end_date.length > 0 ? end_date : undefined;

      const resolvedPublishing =
        (startDate ?? endDate)
          ? {
              startDate,
              endDate,
            }
          : undefined;

      const selfEnrollmentEnabled = propertyValueWithDefault(
        undefined,
        self_enrollment_enabled,
        true,
      );
      const selfEnrollmentUseEnrollmentCode = propertyValueWithDefault(
        undefined,
        self_enrollment_use_enrollment_code,
        false,
      );

      const resolvedSelfEnrollment =
        (selfEnrollmentEnabled ?? selfEnrollmentUseEnrollmentCode) !== undefined
          ? {
              enabled: selfEnrollmentEnabled,
              useEnrollmentCode: selfEnrollmentUseEnrollmentCode,
            }
          : undefined;

      // First, use the editor to copy the course instance
      const courseInstancesPath = path.join(course.path, 'courseInstances');
      const editor = new CourseInstanceCopyEditor({
        locals: res.locals,
        from_course: course,
        from_path: path.join(courseInstancesPath, courseInstance.short_name),
        course_instance: updatedCourseInstance,
        metadataOverrides: {
          publishing: resolvedPublishing,
          selfEnrollment: resolvedSelfEnrollment,
        },
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.status(500).json({ job_sequence_id: serverJob.jobSequenceId });
        return;
      }

      const copiedInstance = await selectCourseInstanceByUuid({
        uuid: editor.uuid,
        course,
      });

      // Assign course instance permissions if a non-None permission was selected.
      if (course_instance_permission !== 'None') {
        await insertCourseInstancePermissions({
          course_id: course.id,
          course_instance_id: copiedInstance.id,
          user_id: authzData.authn_user.id,
          course_instance_role: course_instance_permission,
          authn_user_id: authzData.authn_user.id,
        });
      }

      res.status(200).json({ course_instance_id: copiedInstance.id });
      return;
    } else if (req.body.__action === 'delete_course_instance') {
      const editor = new CourseInstanceDeleteEditor({
        locals: res.locals,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(`/pl/course/${course.id}/course_admin/instances`);
      } catch {
        res.redirect(urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'update_configuration') {
      const infoCourseInstancePath = path.join(
        course.path,
        'courseInstances',
        courseInstance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        throw new error.HttpStatusError(400, 'infoCourseInstance.json does not exist');
      }
      if (!req.body.ciid) {
        throw new error.HttpStatusError(400, 'Short name is required');
      }
      const shortNameValidation = validateShortName(req.body.ciid, courseInstance.short_name);
      if (!shortNameValidation.valid) {
        throw new error.HttpStatusError(
          400,
          `Invalid short name: ${shortNameValidation.lowercaseMessage}`,
        );
      }

      const paths = getPaths(undefined, res.locals);

      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoCourseInstancePath, 'utf8'),
      );

      const parsedBody = SettingsFormBodySchema.parse(req.body);

      courseInstanceInfo.longName = parsedBody.long_name;
      courseInstanceInfo.timezone = propertyValueWithDefault(
        courseInstanceInfo.timezone,
        parsedBody.display_timezone,
        course.display_timezone,
      );
      courseInstanceInfo.groupAssessmentsBy = propertyValueWithDefault(
        courseInstanceInfo.groupAssessmentsBy,
        parsedBody.group_assessments_by,
        'Set',
      );
      // dates from 'datetime-local' inputs are in the format 'YYYY-MM-DDTHH:MM', and we need them to include seconds.
      const parseDateTime = (date: string) => {
        if (date === '') return undefined;
        return Temporal.PlainDateTime.from(date).toString();
      };

      const selfEnrollmentEnabled = propertyValueWithDefault(
        courseInstanceInfo.selfEnrollment?.enabled,
        parsedBody.self_enrollment_enabled,
        true,
      );
      const selfEnrollmentUseEnrollmentCode = propertyValueWithDefault(
        courseInstanceInfo.selfEnrollment?.useEnrollmentCode,
        parsedBody.self_enrollment_use_enrollment_code,
        false,
      );
      const selfEnrollmentRestrictToInstitution = propertyValueWithDefault(
        courseInstanceInfo.selfEnrollment?.restrictToInstitution,
        parsedBody.self_enrollment_restrict_to_institution,
        true,
      );

      const selfEnrollmentBeforeDate = propertyValueWithDefault(
        parseDateTime(courseInstanceInfo.selfEnrollment?.beforeDate ?? ''),
        // We'll only serialize the value if self-enrollment is enabled.
        parsedBody.self_enrollment_enabled &&
          parsedBody.self_enrollment_enabled_before_date_enabled &&
          parsedBody.self_enrollment_enabled_before_date
          ? parseDateTime(parsedBody.self_enrollment_enabled_before_date)
          : undefined,
        undefined,
      );

      const hasSelfEnrollmentSettings =
        (selfEnrollmentEnabled ??
          selfEnrollmentUseEnrollmentCode ??
          selfEnrollmentRestrictToInstitution ??
          selfEnrollmentBeforeDate) !== undefined;

      // Only write self enrollment settings if they are not the default values.
      // When JSON.stringify is used, undefined values are not included in the JSON object.
      if (hasSelfEnrollmentSettings) {
        if (!courseInstance.modern_publishing) {
          throw new error.HttpStatusError(
            400,
            'Self enrollment settings cannot be changed when modern publishing is not enabled.',
          );
        }
        courseInstanceInfo.selfEnrollment = {
          enabled: selfEnrollmentEnabled,
          useEnrollmentCode: selfEnrollmentUseEnrollmentCode,
          restrictToInstitution: selfEnrollmentRestrictToInstitution,
          beforeDate: selfEnrollmentBeforeDate,
        };
      } else {
        courseInstanceInfo.selfEnrollment = undefined;
      }

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceInfo));

      let ciid_new;
      try {
        ciid_new = path.normalize(req.body.ciid);
      } catch {
        throw new error.HttpStatusError(
          400,
          `Invalid short name (could not be normalized): ${req.body.ciid}`,
        );
      }
      const editor = new MultiEditor(
        {
          locals: res.locals,
          description: `Update course instance: ${courseInstance.short_name}`,
        },
        [
          new FileModifyEditor({
            locals: res.locals,
            container: {
              rootPath: paths.rootPath,
              invalidRootPaths: paths.invalidRootPaths,
            },
            filePath: infoCourseInstancePath,
            editContents: b64EncodeUnicode(formattedJson),
            origHash: req.body.orig_hash,
          }),
          new CourseInstanceRenameEditor({
            locals: res.locals,
            ciid_new,
          }),
        ],
      );

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Course instance configuration updated successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'generate_enrollment_code') {
      await sqldb.execute(sql.update_enrollment_code, {
        course_instance_id: courseInstance.id,
        enrollment_code: await uniqueEnrollmentCode(),
      });
      flash('success', 'Self-enrollment key generated successfully');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
