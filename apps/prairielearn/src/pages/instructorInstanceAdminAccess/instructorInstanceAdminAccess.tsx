import assert from 'assert';
import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import {
  convertAccessRuleToJson,
  migrateAccessRuleJsonToAccessControl,
} from '../../lib/course-instance-access.js';
import { CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import {
  createAccessControlOverrideWithEnrollments,
  deleteAccessControlOverride,
  selectAccessControlOverridesByCourseInstance,
  updateAccessControlOverride,
} from '../../models/course-instance-access-control-overrides.js';
import { getEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorInstanceAdminAccess } from './instructorInstanceAdminAccess.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstanceAccessRuleSchema,
    );

    const accessControlOverrides = await selectAccessControlOverridesByCourseInstance(
      res.locals.course_instance.id,
    );

    const {
      authz_data: {
        has_course_instance_permission_view: hasCourseInstancePermissionView,
        has_course_instance_permission_edit: hasCourseInstancePermissionEdit,
      },
    } = getPageContext(res.locals);

    assert(hasCourseInstancePermissionView !== undefined);
    assert(hasCourseInstancePermissionEdit !== undefined);
    const { course_instance: courseInstance } = getCourseInstanceContext(res.locals, 'instructor');

    // Calculate orig_hash for the infoCourseInstance.json file
    const infoCourseInstancePath = path.join(
      res.locals.course.path,
      'courseInstances',
      courseInstance.short_name,
      'infoCourseInstance.json',
    );
    const infoCourseInstancePathExists = await fs.pathExists(infoCourseInstancePath);
    let origHash = '';
    if (infoCourseInstancePathExists) {
      origHash = sha256(
        b64EncodeUnicode(await fs.readFile(infoCourseInstancePath, 'utf8')),
      ).toString();
    }

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Access',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'access',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <>
            <CourseInstanceSyncErrorsAndWarnings
              authzData={res.locals.authz_data}
              courseInstance={res.locals.course_instance}
              course={res.locals.course}
              urlPrefix={res.locals.urlPrefix}
            />
            <InstructorInstanceAdminAccess
              accessRules={accessRules}
              accessControlOverrides={accessControlOverrides}
              courseInstance={courseInstance}
              hasCourseInstancePermissionView={hasCourseInstancePermissionView}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              csrfToken={res.locals.__csrf_token}
              origHash={origHash}
            />
          </>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      authz_data: { has_course_instance_permission_edit: hasCourseInstancePermissionEdit },
    } = getPageContext(res.locals);

    if (!hasCourseInstancePermissionEdit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course instance editor)');
    }

    if (req.body.__action === 'update_access_control') {
      // Validate that we're not mixing systems
      const accessRules = await queryRows(
        sql.course_instance_access_rules,
        { course_instance_id: res.locals.course_instance.id },
        CourseInstanceAccessRuleSchema,
      );

      if (accessRules.length > 0) {
        throw new error.HttpStatusError(
          400,
          'Cannot update access control when legacy allowAccess rules are present',
        );
      }

      // Read the existing infoCourseInstance.json file
      const infoCourseInstancePath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        throw new error.HttpStatusError(400, 'infoCourseInstance.json does not exist');
      }

      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoCourseInstancePath, 'utf8'),
      );

      // Update the access control settings
      courseInstanceInfo.accessControl = req.body.accessControl;

      // Format and write the updated JSON
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceInfo));

      // JSON file has been formatted and is ready to be written
      const paths = getPaths(undefined, res.locals);
      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: infoCourseInstancePath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      flash('success', 'Access control settings updated successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'migrate_access_rules') {
      // Starting migration of access rules to access control

      // Get the existing access rules from the database
      const accessRules = await queryRows(
        sql.course_instance_access_rules,
        { course_instance_id: res.locals.course_instance.id },
        CourseInstanceAccessRuleSchema,
      );

      if (accessRules.length === 0) {
        throw new error.HttpStatusError(400, 'No access rules found to migrate');
      }

      // Convert access rules to JSON format
      const accessRuleJsonArray = accessRules.map((rule) =>
        convertAccessRuleToJson(rule, res.locals.course_instance.display_timezone),
      );

      // Calculate the migration
      const migrationResult = migrateAccessRuleJsonToAccessControl(accessRuleJsonArray);

      if (!migrationResult.success) {
        throw new error.HttpStatusError(
          400,
          `Cannot migrate access rules: ${migrationResult.error}`,
        );
      }

      // Read the existing infoCourseInstance.json file
      const infoCourseInstancePath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        throw new error.HttpStatusError(400, 'infoCourseInstance.json does not exist');
      }

      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoCourseInstancePath, 'utf8'),
      );

      // Add the access control settings
      if (!courseInstanceInfo.accessControl) {
        courseInstanceInfo.accessControl = {};
      }

      courseInstanceInfo.accessControl = migrationResult.accessControl;

      // Remove the allowAccess rules
      if (courseInstanceInfo.allowAccess) {
        delete courseInstanceInfo.allowAccess;
      }

      // Course instance info has been updated with access control settings

      // Format and write the updated JSON
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceInfo));

      const paths = getPaths(undefined, res.locals);
      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: infoCourseInstancePath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (fileError) {
        console.error('Error migrating access rules:', fileError);

        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      // Insert overrides if any were generated from the migration
      if (migrationResult.overrides.length > 0) {
        for (const override of migrationResult.overrides) {
          if (override.uids && override.uids.length > 0) {
            // Get enrollment IDs for the UIDs
            const enrollments = await getEnrollmentsByUidsInCourseInstance({
              uids: override.uids,
              course_instance_id: res.locals.course_instance.id,
            });

            if (enrollments.length > 0) {
              const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

              await createAccessControlOverrideWithEnrollments({
                course_instance_id: res.locals.course_instance.id,
                enabled: override.enabled,
                name: override.name,
                published_end_date: override.published_end_date
                  ? new Date(override.published_end_date)
                  : null,
                enrollment_ids: enrollmentIds,
              });
            }
          }
        }
      }

      flash('success', 'Access rules migrated to access control successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_override') {
      const name = req.body.name || null;
      const enabled = req.body.enabled === 'true';
      const published_end_date = req.body.published_end_date
        ? new Date(req.body.published_end_date)
        : null;
      const uids = req.body.uids
        .split(/[,\n]/)
        .map((uid: string) => uid.trim())
        .filter((uid: string) => uid.length > 0);

      if (uids.length === 0) {
        throw new error.HttpStatusError(400, 'At least one UID is required');
      }

      // Get enrollment IDs for the UIDs
      const enrollments = await getEnrollmentsByUidsInCourseInstance({
        uids,
        course_instance_id: res.locals.course_instance.id,
      });

      if (enrollments.length === 0) {
        throw new error.HttpStatusError(400, 'No enrollments found for the provided UIDs');
      }

      const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

      await createAccessControlOverrideWithEnrollments({
        course_instance_id: res.locals.course_instance.id,
        enabled,
        name,
        published_end_date,
        enrollment_ids: enrollmentIds,
      });

      flash('success', 'Access control override added successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_override') {
      const override_id = req.body.override_id;

      await deleteAccessControlOverride({
        override_id,
        course_instance_id: res.locals.course_instance.id,
      });

      flash('success', 'Access control override deleted successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'toggle_override') {
      const override_id = req.body.override_id;
      const enabled = req.body.enabled === 'true';

      // Get the current override to preserve other fields
      const currentOverrides = await selectAccessControlOverridesByCourseInstance(
        res.locals.course_instance.id,
      );
      const currentOverride = currentOverrides.find((o) => o.id === override_id);

      if (!currentOverride) {
        throw new error.HttpStatusError(404, 'Override not found');
      }

      await updateAccessControlOverride({
        override_id,
        course_instance_id: res.locals.course_instance.id,
        enabled,
        name: currentOverride.name,
        published_end_date: currentOverride.published_end_date,
      });

      flash('success', 'Access control override updated successfully');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;
