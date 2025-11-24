import * as path from 'path';

import { Temporal } from '@js-temporal/polyfill';
import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/preact/server';

import { DeleteCourseInstanceModal } from '../../components/DeleteCourseInstanceModal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getSelfEnrollmentLinkUrl } from '../../lib/client/url.js';
import {
  CourseInstanceCopyEditor,
  CourseInstanceDeleteEditor,
  CourseInstanceRenameEditor,
  FileModifyEditor,
  MultiEditor,
  propertyValueWithDefault,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { courseRepoContentUrl } from '../../lib/github.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { getCanonicalTimezones } from '../../lib/timezones.js';
import { getCanonicalHost } from '../../lib/url.js';
import { selectCourseInstanceByUuid } from '../../models/course-instances.js';
import type { CourseInstanceJsonInput } from '../../schemas/index.js';
import { uniqueEnrollmentCode } from '../../sync/fromDisk/courseInstances.js';

import { InstructorInstanceAdminSettings } from './instructorInstanceAdminSettings.html.js';
import { SettingsFormBodySchema } from './instructorInstanceAdminSettings.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      course_instance: courseInstance,
      course,
      institution,
      has_enhanced_navigation,
      authz_data,
      urlPrefix,
      navPage,
      __csrf_token,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const shortNames = await sqldb.queryRows(sql.short_names, { course_id: course.id }, z.string());
    const longNames = await sqldb.queryRows(
      sql.long_names,
      { course_id: course.id },
      z.string().nullable(),
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
    const infoCourseInfoPathExists = await fs.pathExists(fullInfoCourseInstancePath);
    let origHash = '';
    if (infoCourseInfoPathExists) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(fullInfoCourseInstancePath, 'utf8')),
      ).toString();
    }

    const instanceGHLink = courseRepoContentUrl(
      res.locals.course,
      `courseInstances/${courseInstance.short_name}`,
    );

    const canEdit = authz_data.has_course_permission_edit && !course.example_course;

    const enrollmentManagementEnabled = await features.enabled('enrollment-management', {
      institution_id: institution.id,
      course_id: course.id,
      course_instance_id: courseInstance.id,
    });

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
            <CourseInstanceSyncErrorsAndWarnings
              authzData={{
                has_course_instance_permission_edit:
                  authz_data.has_course_instance_permission_edit ?? false,
              }}
              courseInstance={courseInstance}
              course={course}
              urlPrefix={urlPrefix}
            />
            <Hydrate>
              <InstructorInstanceAdminSettings
                csrfToken={__csrf_token}
                urlPrefix={urlPrefix}
                navPage={navPage}
                hasEnhancedNavigation={has_enhanced_navigation}
                canEdit={canEdit}
                courseInstance={courseInstance}
                institution={institution}
                shortNames={shortNames}
                longNames={longNames}
                availableTimezones={availableTimezones}
                origHash={origHash}
                instanceGHLink={instanceGHLink}
                studentLink={studentLink}
                publicLink={publicLink}
                selfEnrollLink={selfEnrollLink}
                enrollmentManagementEnabled={enrollmentManagementEnabled}
                infoCourseInstancePath={infoCourseInstancePath}
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
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'copy_course_instance') {
      const { short_name, long_name, start_date, end_date } = z
        .object({
          short_name: z.string(),
          long_name: z.string(),
          start_date: z.string(),
          end_date: z.string(),
        })
        .parse(req.body);

      // Validate short_name
      if (!short_name) {
        throw new error.HttpStatusError(400, 'Short name is required');
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(short_name)) {
        throw new error.HttpStatusError(
          400,
          'Short name must contain only letters, numbers, dashes, and underscores, with no spaces',
        );
      }

      // Check if short_name already exists
      const existingShortNames = await sqldb.queryRows(
        sql.short_names,
        { course_id: res.locals.course.id },
        z.string(),
      );
      if (existingShortNames.includes(short_name)) {
        throw new error.HttpStatusError(
          400,
          'A course instance with this short name already exists',
        );
      }

      // First, use the editor to copy the course instance
      const courseInstancesPath = path.join(res.locals.course.path, 'courseInstances');
      const editor = new CourseInstanceCopyEditor({
        locals: res.locals as any,
        from_course: res.locals.course,
        from_path: path.join(courseInstancesPath, res.locals.course_instance.short_name),
        course_instance: res.locals.course_instance,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (err) {
        throw new error.HttpStatusError(500, 'Failed to copy course instance');
      }

      // Now update the copied instance with the user-provided names and publishing settings
      const copiedInstance = await selectCourseInstanceByUuid({
        uuid: editor.uuid,
        course: res.locals.course,
      });

      // The editor created a copy with auto-generated name, we need to rename it
      const autoGeneratedPath = path.join(courseInstancesPath, copiedInstance.short_name);
      const targetPath = path.join(courseInstancesPath, short_name);

      // Read the infoCourseInstance.json
      const infoPath = path.join(autoGeneratedPath, 'infoCourseInstance.json');
      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoPath, 'utf8'),
      );

      // Update names
      courseInstanceInfo.longName = long_name;

      // Update publishing settings if provided
      if (start_date || end_date) {
        courseInstanceInfo.publishing = {
          startDate: start_date || undefined,
          endDate: end_date || undefined,
        };
      }

      // Write the updated info
      await fs.writeJson(infoPath, courseInstanceInfo, { spaces: 4 });

      // Rename the directory if needed
      if (copiedInstance.short_name !== short_name) {
        await fs.move(autoGeneratedPath, targetPath);
      }

      // Sync to get the updated instance
      const syncResult = await sqldb.callRow(
        'sync_course_instances',
        [res.locals.course.id],
        z.object({ sync_warnings: z.string(), sync_errors: z.string() }),
      );

      if (syncResult.sync_errors) {
        throw new error.HttpStatusError(500, `Sync errors: ${syncResult.sync_errors}`);
      }

      // Get the final course instance
      const finalInstance = await sqldb.queryRow(
        sql.select_course_instance_by_short_name,
        { course_id: res.locals.course.id, short_name },
        z.object({ id: z.string() }),
      );

      const redirectUrl = `/pl/course_instance/${finalInstance.id}/instructor/instance_admin/settings`;
      res.json({ redirect_url: redirectUrl });
    } else if (req.body.__action === 'delete_course_instance') {
      const editor = new CourseInstanceDeleteEditor({
        locals: res.locals as any,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(`/pl/course/${res.locals.course.id}/course_admin/instances`);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'update_configuration') {
      const { course_instance: courseInstanceContext, course: courseContext } = extractPageContext(
        res.locals,
        {
          pageType: 'courseInstance',
          accessType: 'instructor',
        },
      );
      const infoCourseInstancePath = path.join(
        courseContext.path,
        'courseInstances',
        courseInstanceContext.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        throw new error.HttpStatusError(400, 'infoCourseInstance.json does not exist');
      }
      if (!req.body.ciid) {
        throw new error.HttpStatusError(400, `Invalid CIID (was falsy): ${req.body.ciid}`);
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.ciid)) {
        throw new error.HttpStatusError(
          400,
          `Invalid CIID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.ciid}`,
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
        courseContext.display_timezone,
      );
      courseInstanceInfo.groupAssessmentsBy = propertyValueWithDefault(
        courseInstanceInfo.groupAssessmentsBy,
        parsedBody.group_assessments_by,
        'Set',
      );
      courseInstanceInfo.hideInEnrollPage = propertyValueWithDefault(
        courseInstanceInfo.hideInEnrollPage,
        !parsedBody.show_in_enroll_page,
        false,
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
        { isUIBoolean: true },
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
        parsedBody.self_enrollment_enabled && parsedBody.self_enrollment_enabled_before_date
          ? parseDateTime(parsedBody.self_enrollment_enabled_before_date)
          : undefined,
        undefined,
      );

      const hasSelfEnrollmentSettings =
        (selfEnrollmentEnabled ??
          selfEnrollmentUseEnrollmentCode ??
          selfEnrollmentRestrictToInstitution ??
          selfEnrollmentBeforeDate) !== undefined;

      const {
        course_instance: courseInstance,
        course,
        institution,
      } = extractPageContext(res.locals, {
        pageType: 'courseInstance',
        accessType: 'instructor',
      });
      const enrollmentManagementEnabled = await features.enabled('enrollment-management', {
        institution_id: institution.id,
        course_id: course.id,
        course_instance_id: courseInstance.id,
      });
      // Only write self enrollment settings if they are not the default values.
      // When JSON.stringify is used, undefined values are not included in the JSON object.
      if (hasSelfEnrollmentSettings) {
        if (!enrollmentManagementEnabled) {
          throw new error.HttpStatusError(
            400,
            'Self enrollment settings cannot be changed when enrollment management is not enabled.',
          );
        }
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
          `Invalid CIID (could not be normalized): ${req.body.ciid}`,
        );
      }
      const editor = new MultiEditor(
        {
          locals: res.locals as any,
          description: `Update course instance: ${res.locals.course_instance.short_name}`,
        },
        [
          new FileModifyEditor({
            locals: res.locals as any,
            container: {
              rootPath: paths.rootPath,
              invalidRootPaths: paths.invalidRootPaths,
            },
            filePath: infoCourseInstancePath,
            editContents: b64EncodeUnicode(formattedJson),
            origHash: req.body.orig_hash,
          }),
          new CourseInstanceRenameEditor({
            locals: res.locals as any,
            ciid_new,
          }),
        ],
      );

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Course instance configuration updated successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'generate_enrollment_code') {
      await sqldb.execute(sql.update_enrollment_code, {
        course_instance_id: res.locals.course_instance.id,
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
