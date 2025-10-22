import assert from 'assert';
import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { execute, loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import {
  convertAccessRuleToJson,
  migrateAccessRuleJsonToPublishingConfiguration,
} from '../../lib/course-instance-access.shared.js';
import { CourseInstancePublishingRuleSchema } from '../../lib/db-types.js';
import { FileModifyEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import {
  createPublishingExtensionWithEnrollments,
  deletePublishingExtension,
  selectPublishingExtensionsWithUsersByCourseInstance,
} from '../../models/course-instance-publishing-extensions.js';
import { selectUsersAndEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorInstanceAdminPublishing } from './instructorInstanceAdminPublishing.html.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

// Validate a list of UIDs against enrollments in this course instance.
// Returns the list of UIDs that are NOT enrolled (invalidUids).
router.get(
  '/extension/check',
  asyncHandler(async (req, res) => {
    const {
      authz_data: { has_course_instance_permission_edit: hasCourseInstancePermissionEdit },
    } = getPageContext(res.locals);

    if (!hasCourseInstancePermissionEdit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course instance editor)');
    }

    // Accept comma-separated UIDs in query parameter
    const uidsString = typeof req.query.uids === 'string' ? req.query.uids : '';
    const uids: string[] = uidsString
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Verify each UID is enrolled (matches either users.uid or enrollments.pending_uid)
    const validRecords = await selectUsersAndEnrollmentsByUidsInCourseInstance({
      uids,
      course_instance_id: res.locals.course_instance.id,
    });
    const validUids = new Set(validRecords.map((record) => record.user.uid));
    const invalidUids = uids.filter((uid) => !validUids.has(uid));

    res.json({ invalidUids });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accessControlExtensions = await selectPublishingExtensionsWithUsersByCourseInstance(
      res.locals.course_instance.id,
    );

    const {
      authz_data: {
        has_course_instance_permission_edit: hasCourseInstancePermissionEdit,
        has_course_instance_permission_view: hasCourseInstancePermissionView,
      },
    } = getPageContext(res.locals);

    assert(hasCourseInstancePermissionEdit !== undefined);
    assert(hasCourseInstancePermissionView !== undefined);
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

    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: res.locals.course_instance.id },
      CourseInstancePublishingRuleSchema,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Publishing',
        navContext: {
          type: 'instructor',
          page: 'instance_admin',
          subPage: 'publishing',
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
              accessControlExtensions={accessControlExtensions}
              courseInstance={courseInstance}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              hasCourseInstancePermissionView={hasCourseInstancePermissionView}
              accessRules={accessRules}
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
      try {
        // Validate that we're not mixing systems
        const accessRules = await queryRows(
          sql.course_instance_access_rules,
          { course_instance_id: res.locals.course_instance.id },
          CourseInstancePublishingRuleSchema,
        );

        if (accessRules.length > 0) {
          res.status(400).json({
            message: 'Cannot update access control when legacy allowAccess rules are present',
          });
          return;
        }

        // Read the existing infoCourseInstance.json file
        const infoCourseInstancePath = path.join(
          res.locals.course.path,
          'courseInstances',
          res.locals.course_instance.short_name,
          'infoCourseInstance.json',
        );

        if (!(await fs.pathExists(infoCourseInstancePath))) {
          res.status(400).json({ message: 'infoCourseInstance.json does not exist' });
          return;
        }

        const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
          await fs.readFile(infoCourseInstancePath, 'utf8'),
        );

        const parsedBody = z
          .object({
            accessControl: z.object({
              publishDate: z.string().nullable(),
              unpublishDate: z.string().nullable(),
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
          unpublishDate: propertyValueWithDefault(
            courseInstanceInfo.publishing?.unpublishDate,
            parsedBody.accessControl.unpublishDate,
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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update access control';
        res.status(400).json({ message });
        return;
      }
    } else if (req.body.__action === 'migrate_access_rules') {
      const accessRules = await queryRows(
        sql.course_instance_access_rules,
        { course_instance_id: res.locals.course_instance.id },
        CourseInstancePublishingRuleSchema,
      );
      const accessRuleJsonArray = accessRules.map((rule) =>
        convertAccessRuleToJson(rule, res.locals.course_instance.display_timezone),
      );
      const migrationResult = migrateAccessRuleJsonToPublishingConfiguration(accessRuleJsonArray);

      if (!migrationResult.success) {
        flash('error', migrationResult.error);
        res.redirect(req.originalUrl);
        return;
      }

      // Read the existing infoCourseInstance.json file
      const infoCourseInstancePath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'infoCourseInstance.json',
      );

      if (!(await fs.pathExists(infoCourseInstancePath))) {
        flash('error', 'infoCourseInstance.json does not exist');
        res.redirect(req.originalUrl);
        return;
      }

      const courseInstanceInfo: CourseInstanceJsonInput = JSON.parse(
        await fs.readFile(infoCourseInstancePath, 'utf8'),
      );

      if (
        courseInstanceInfo.publishing !== undefined &&
        Object.keys(courseInstanceInfo.publishing).length > 0
      ) {
        flash('error', 'publishing settings already exist');
        res.redirect(req.originalUrl);
        return;
      }

      // Migrate the publishing settings
      courseInstanceInfo.publishing = migrationResult.publishingConfiguration;
      courseInstanceInfo.allowAccess = undefined;

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
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }
      flash('success', 'Access rules migrated to access control successfully');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_extension') {
      try {
        const EmailsSchema = z
          .array(z.string().trim().email())
          .min(1, 'At least one UID is required');
        const AddExtensionSchema = z.object({
          __action: z.literal('add_extension'),
          name: z
            .string()
            .trim()
            .optional()
            .transform((v) => (v === '' || v === undefined ? null : v)),
          unpublish_date: z.string().trim().min(1, 'Unpublish date is required'),
          uids: z.preprocess(
            (val) =>
              typeof val === 'string'
                ? val
                    .split(/[\n,\s]+/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0)
                : val,
            EmailsSchema,
          ),
        });
        const body = AddExtensionSchema.parse(req.body);

        const records = await selectUsersAndEnrollmentsByUidsInCourseInstance({
          uids: body.uids,
          course_instance_id: res.locals.course_instance.id,
        });

        if (records.length === 0) {
          res.status(400).json({ message: 'No enrollments found for any of the provided UIDs' });
          return;
        }

        const enrollmentIds = records.map(({ enrollment }) => enrollment.id);

        await createPublishingExtensionWithEnrollments({
          course_instance_id: res.locals.course_instance.id,
          name: body.name ?? null,
          unpublish_date: new Date(body.unpublish_date),
          enrollment_ids: enrollmentIds,
        });

        res.status(200).json({ success: true });
        return;
      } catch (err) {
        const message =
          err instanceof Error && !(err instanceof z.ZodError)
            ? err.message
            : 'Failed to add extension';
        res.status(400).json({ message });
        return;
      }
    } else if (req.body.__action === 'delete_extension') {
      try {
        const extension_id = req.body.extension_id;

        await deletePublishingExtension({
          extension_id,
          course_instance_id: res.locals.course_instance.id,
        });

        res.status(200).json({ success: true });
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete extension';
        res.status(400).json({ message });
        return;
      }
    } else if (req.body.__action === 'edit_extension') {
      try {
        const EmailsSchema = z
          .array(z.string().trim().email('Invalid email format'))
          .min(1, 'At least one UID is required');
        const EditExtensionSchema = z.object({
          __action: z.literal('edit_extension'),
          extension_id: z.string().trim().min(1),
          name: z
            .string()
            .trim()
            .optional()
            .transform((v) => (v === '' || v === undefined ? null : v)),
          unpublish_date: z.string().trim().optional().default(''),
          uids: z.preprocess(
            (val) =>
              typeof val === 'string'
                ? val
                    .split(/[\n,\s]+/)
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0)
                : val,
            EmailsSchema,
          ),
        });
        const body = EditExtensionSchema.parse(req.body);

        await runInTransactionAsync(async () => {
          // Update extension metadata
          await execute(sql.update_extension, {
            extension_id: body.extension_id,
            name: body.name ?? '',
            unpublish_date: body.unpublish_date,
            course_instance_id: res.locals.course_instance.id,
          });

          // Desired enrollments for provided UIDs
          const desiredRecords = await selectUsersAndEnrollmentsByUidsInCourseInstance({
            uids: body.uids,
            course_instance_id: res.locals.course_instance.id,
          });

          if (desiredRecords.length === 0) {
            throw new Error('No enrollments found for provided UIDs');
          }

          const desiredEnrollmentIds = new Set(desiredRecords.map((r) => r.enrollment.id));

          // Current enrollments on this extension
          const extensions = await selectPublishingExtensionsWithUsersByCourseInstance(
            res.locals.course_instance.id,
          );
          const current = extensions.find((e) => e.id === body.extension_id);
          const currentEnrollmentIds = new Set(
            (current?.user_data ?? []).map((u) => u.enrollment_id),
          );

          // Compute diffs
          const toAdd: string[] = [];
          for (const id of desiredEnrollmentIds) {
            if (!currentEnrollmentIds.has(id)) toAdd.push(id);
          }
          const toRemove: string[] = [];
          for (const id of currentEnrollmentIds) {
            if (!desiredEnrollmentIds.has(id)) toRemove.push(id);
          }

          // Apply removals
          for (const enrollment_id of toRemove) {
            await execute(sql.remove_student_from_extension, {
              extension_id: body.extension_id,
              enrollment_id,
            });
          }
          // Apply additions
          for (const enrollment_id of toAdd) {
            await execute(sql.add_user_to_extension, {
              extension_id: body.extension_id,
              enrollment_id,
            });
          }
        });

        res.status(200).json({ success: true });
        return;
      } catch (err) {
        if (err instanceof z.ZodError) {
          const errorMessages = err.errors.map((error) => {
            if (error.path.length > 0) {
              const field = error.path.join('.');
              return `${field}: ${error.message}`;
            }
            return error.message;
          });
          res.status(400).json({ message: errorMessages.join(', ') });
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to edit extension';
        res.status(400).json({ message });
        return;
      }
    } else {
      throw new error.HttpStatusError(400, 'Unknown action');
    }
  }),
);

export default router;
