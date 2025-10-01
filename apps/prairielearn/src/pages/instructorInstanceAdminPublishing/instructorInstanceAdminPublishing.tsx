import assert from 'assert';
import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import {
  convertAccessRuleToJson,
  migrateAccessRuleJsonToPublishingConfiguration,
} from '../../lib/course-instance-access.js';
import { CourseInstancePublishingRuleSchema } from '../../lib/db-types.js';
import { FileModifyEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import {
  createPublishingExtensionWithEnrollments,
  deletePublishingExtension,
  selectPublishingExtensionsWithUsersByCourseInstance,
} from '../../models/course-instance-publishing-extensions.js';
import { getEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorInstanceAdminPublishing } from './instructorInstanceAdminPublishing.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstancePublishingRuleSchema,
    );

    const accessControlExtensions = await selectPublishingExtensionsWithUsersByCourseInstance(
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
            <InstructorInstanceAdminPublishing
              accessRules={accessRules}
              accessControlExtensions={accessControlExtensions}
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
        CourseInstancePublishingRuleSchema,
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

      const parsedBody = z
        .object({
          accessControl: z.object({
            publishDate: z.string().nullable(),
            archiveDate: z.string().nullable(),
          }),
        })
        .parse(req.body);

      // Update the publishing settings
      const resolvedPublishing = {
        publishDate: propertyValueWithDefault(
          courseInstanceInfo.publishing?.publishDate,
          parsedBody.accessControl.publishDate,
          (v: string | null) => v === null || v === '',
        ),
        archiveDate: propertyValueWithDefault(
          courseInstanceInfo.publishing?.archiveDate,
          parsedBody.accessControl.archiveDate,
          (v: string | null) => v === null || v === '',
        ),
      };
      const hasPublishing = Object.values(resolvedPublishing).some((v) => v !== undefined);
      if (!hasPublishing) {
        courseInstanceInfo.publishing = undefined;
      } else {
        courseInstanceInfo.publishing = resolvedPublishing;
      }

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
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      flash('success', 'Access control settings updated successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'migrate_access_rules') {
      // Starting migration of access rules to access control

      // Get the existing access rules from the database
      const accessRules = await queryRows(
        sql.course_instance_access_rules,
        { course_instance_id: res.locals.course_instance.id },
        CourseInstancePublishingRuleSchema,
      );

      if (accessRules.length === 0) {
        throw new error.HttpStatusError(400, 'No access rules found to migrate');
      }

      // Convert access rules to JSON format
      const accessRuleJsonArray = accessRules.map((rule) =>
        convertAccessRuleToJson(rule, res.locals.course_instance.display_timezone),
      );

      // Calculate the migration
      const migrationResult = migrateAccessRuleJsonToPublishingConfiguration(accessRuleJsonArray);

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

      // Add the publishing settings
      if (!courseInstanceInfo.publishing) {
        courseInstanceInfo.publishing = {};
      }

      courseInstanceInfo.publishing = migrationResult.publishingConfiguration;

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

        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      // Insert extensions if any were generated from the migration
      if (migrationResult.extensions.length > 0) {
        for (const extension of migrationResult.extensions) {
          if (extension.uids && extension.uids.length > 0) {
            // Get enrollment IDs for the UIDs
            const enrollments = await getEnrollmentsByUidsInCourseInstance({
              uids: extension.uids,
              course_instance_id: res.locals.course_instance.id,
            });

            if (enrollments.length > 0) {
              const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

              await createPublishingExtensionWithEnrollments({
                course_instance_id: res.locals.course_instance.id,
                name: extension.name,
                archive_date: extension.archive_date ? new Date(extension.archive_date) : null,
                enrollment_ids: enrollmentIds,
              });
            }
          }
        }
      }

      flash('success', 'Access rules migrated to access control successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_extension') {
      const name = req.body.name || null;
      const archive_date = req.body.archive_date ? new Date(req.body.archive_date) : null;
      const uids = req.body.uids
        .split(/[,\n]/)
        .map((uid: string) => uid.trim())
        .filter((uid: string) => uid.length > 0);

      if (uids.length === 0) {
        res.status(400).json({ message: 'At least one UID is required' });
        return;
      }

      // Validate that all UIDs are in email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidUids = uids.filter((uid) => !emailRegex.test(uid));
      if (invalidUids.length > 0) {
        const errorMessage = `Invalid email format for UIDs: ${invalidUids.join(', ')}`;
        res.status(400).json({ message: errorMessage });
        return;
      }

      // Get enrollment IDs for the UIDs
      const enrollments = await getEnrollmentsByUidsInCourseInstance({
        uids,
        course_instance_id: res.locals.course_instance.id,
      });

      if (enrollments.length === 0) {
        res.status(400).json({ message: 'No enrollments found for any of the provided UIDs' });
        return;
      }

      const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

      await createPublishingExtensionWithEnrollments({
        course_instance_id: res.locals.course_instance.id,
        name,
        archive_date,
        enrollment_ids: enrollmentIds,
      });

      res.status(200).json({ success: true });
      return;
    } else if (req.body.__action === 'delete_extension') {
      const extension_id = req.body.extension_id;

      await deletePublishingExtension({
        extension_id,
        course_instance_id: res.locals.course_instance.id,
      });

      res.status(200).json({ success: true });
      return;
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;
