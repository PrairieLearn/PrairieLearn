import assert from 'assert';
import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { type AuthzData, assertHasRole } from '../../lib/authz-data-lib.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { getCourseInstanceContext, getPageContext } from '../../lib/client/page-context.js';
import { config } from '../../lib/config.js';
import { type CourseInstance, CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';
import { FileModifyEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import {
  addEnrollmentToPublishingExtension,
  createPublishingExtensionWithEnrollments,
  deletePublishingExtension,
  removeStudentFromPublishingExtension,
  selectEnrollmentsForPublishingExtension,
  selectPublishingExtensionById,
  selectPublishingExtensionByName,
  updatePublishingExtension,
} from '../../models/course-instance-publishing-extensions.js';
import { selectUsersAndEnrollmentsByUidsInCourseInstance } from '../../models/enrollment.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';

import { InstructorInstanceAdminPublishing } from './instructorInstanceAdminPublishing.html.js';
import { CourseInstancePublishingExtensionWithUsersSchema } from './instructorInstanceAdminPublishing.types.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all publishing extensions for a course instance with user data.
 *
 * Only returns extensions for joined users.
 */
export async function selectPublishingExtensionsWithUsersByCourseInstance({
  courseInstance,
  authzData,
  requestedRole,
}: {
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requestedRole: 'System' | 'Student Data Viewer' | 'Student Data Editor' | 'Any';
}) {
  assertHasRole(authzData, requestedRole);
  return await queryRows(
    sql.select_publishing_extensions_with_users_by_course_instance,
    { course_instance_id: courseInstance.id },
    CourseInstancePublishingExtensionWithUsersSchema,
  );
}

// Supports a client-side table refresh.
router.get(
  '/extension/data.json',
  asyncHandler(async (req, res) => {
    const {
      authz_data: { has_course_instance_permission_view: hasCourseInstancePermissionView },
    } = getPageContext(res.locals);

    if (!hasCourseInstancePermissionView) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course instance viewer)');
    }

    const accessControlExtensions = await selectPublishingExtensionsWithUsersByCourseInstance({
      courseInstance: res.locals.course_instance,
      authzData: res.locals.authz_data,
      requestedRole: 'Student Data Viewer',
    });
    res.json(accessControlExtensions);
  }),
);

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
      courseInstance: res.locals.course_instance,
      requestedRole: 'Student Data Viewer',
      authzData: res.locals.authz_data,
    });
    const validUids = new Set(validRecords.map((record) => record.user.uid));
    const invalidUids = uids.filter((uid) => !validUids.has(uid));

    res.json({ invalidUids });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const publishingExtensions = await selectPublishingExtensionsWithUsersByCourseInstance({
      courseInstance: res.locals.course_instance,
      authzData: res.locals.authz_data,
      requestedRole: 'Student Data Viewer',
    });

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
      CourseInstanceAccessRuleSchema,
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
              publishingExtensions={publishingExtensions}
              courseInstance={courseInstance}
              hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
              hasCourseInstancePermissionView={hasCourseInstancePermissionView}
              accessRules={accessRules}
              csrfToken={res.locals.__csrf_token}
              origHash={origHash}
              isDevMode={config.devMode}
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
          CourseInstanceAccessRuleSchema,
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
              startDate: z.string().nullable(),
              endDate: z.string().nullable(),
            }),
          })
          .parse(req.body);

        // Update the publishing settings
        const resolvedPublishing = {
          startDate: propertyValueWithDefault(
            courseInstanceInfo.publishing?.startDate,
            parsedBody.accessControl.startDate,
            (v: string | null) => v === null || v === '',
          ),
          endDate: propertyValueWithDefault(
            courseInstanceInfo.publishing?.endDate,
            parsedBody.accessControl.endDate,
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
    } else if (req.body.__action === 'add_extension') {
      try {
        const EmailsSchema = z
          .array(z.string().trim().email())
          .min(1, 'At least one UID is required');
        const AddExtensionSchema = z.object({
          __action: z.literal('add_extension'),
          name: z
            .string()
            .trim() // remove whitespace from the name
            .optional()
            .transform((v) => (v === '' || v === undefined ? null : v)),
          end_date: z.string().trim().min(1, 'End date is required'),
          uids: z.preprocess(
            (val) =>
              typeof val === 'string'
                ? [
                    ...new Set(
                      val
                        .split(/[\n,\s]+/)
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0),
                    ),
                  ]
                : val,
            EmailsSchema,
          ),
        });
        const body = AddExtensionSchema.parse(req.body);

        const enrollments = (
          await selectUsersAndEnrollmentsByUidsInCourseInstance({
            uids: body.uids,
            courseInstance: res.locals.course_instance,
            requestedRole: 'Student Data Viewer',
            authzData: res.locals.authz_data,
          })
        ).map((record) => record.enrollment);
        if (enrollments.length === 0) {
          res.status(400).json({ message: 'No enrollments found for any of the provided UIDs' });
          return;
        }

        // Check if an extension with this name already exists
        if (body.name) {
          const existingExtension = await selectPublishingExtensionByName({
            name: body.name,
            courseInstance: res.locals.course_instance,
            authzData: res.locals.authz_data,
            requestedRole: 'Student Data Viewer',
          });

          if (existingExtension) {
            res
              .status(400)
              .json({ message: `An extension with the name "${body.name}" already exists` });
            return;
          }
        }

        await createPublishingExtensionWithEnrollments({
          courseInstance: res.locals.course_instance,
          name: body.name,
          endDate: new Date(body.end_date),
          enrollments,
          authzData: res.locals.authz_data,
          requestedRole: 'Student Data Editor',
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
        const extension = await selectPublishingExtensionById({
          id: req.body.extension_id,
          courseInstance: res.locals.course_instance,
          requestedRole: 'Student Data Viewer',
          authzData: res.locals.authz_data,
        });

        await deletePublishingExtension({
          extension,
          courseInstance: res.locals.course_instance,
          authzData: res.locals.authz_data,
          requestedRole: 'Student Data Editor',
        });

        res.status(200).json({ success: true });
        return;
      } catch (err) {
        console.error(err);
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
            .trim() // remove whitespace from the name
            .optional()
            .transform((v) => (v === '' || v === undefined ? null : v)),
          end_date: z.string().trim().optional().default(''),
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

        // Check if an extension with this name already exists (excluding the current one)
        if (body.name) {
          const existingExtension = await selectPublishingExtensionByName({
            name: body.name,
            courseInstance: res.locals.course_instance,
            authzData: res.locals.authz_data,
            requestedRole: 'Student Data Viewer',
          });

          if (existingExtension && existingExtension.id !== body.extension_id) {
            res
              .status(400)
              .json({ message: `An extension with the name "${body.name}" already exists` });
            return;
          }
        }

        await runInTransactionAsync(async () => {
          const extension = await selectPublishingExtensionById({
            id: body.extension_id,
            courseInstance: res.locals.course_instance,
            requestedRole: 'Student Data Viewer',
            authzData: res.locals.authz_data,
          });

          const desiredEnrollments = (
            await selectUsersAndEnrollmentsByUidsInCourseInstance({
              uids: body.uids,
              courseInstance: res.locals.course_instance,
              authzData: res.locals.authz_data,
              requestedRole: 'Student Data Viewer',
            })
          ).map((record) => record.enrollment);

          if (desiredEnrollments.length === 0) {
            throw new Error('No enrollments found for provided UIDs');
          }

          await updatePublishingExtension({
            extension,
            name: body.name,
            endDate: body.end_date ? new Date(body.end_date) : null,
            authzData: res.locals.authz_data,
            requestedRole: 'Student Data Editor',
          });

          const currentEnrollments = await selectEnrollmentsForPublishingExtension({
            extension,
            authzData: res.locals.authz_data,
            requestedRole: 'Student Data Viewer',
          });
          const desiredEnrollmentsIds = new Set(desiredEnrollments.map((e) => e.id));
          const currentEnrollmentsIds = new Set(currentEnrollments.map((e) => e.id));
          const enrollmentsToAdd = desiredEnrollments.filter(
            (e) => !currentEnrollmentsIds.has(e.id),
          );
          const enrollmentsToRemove = currentEnrollments.filter(
            (e) => !desiredEnrollmentsIds.has(e.id),
          );

          for (const enrollment of enrollmentsToRemove) {
            await removeStudentFromPublishingExtension({
              courseInstancePublishingExtension: extension,
              enrollment,
              authzData: res.locals.authz_data,
              requestedRole: 'Student Data Editor',
            });
          }

          for (const enrollment of enrollmentsToAdd) {
            await addEnrollmentToPublishingExtension({
              courseInstancePublishingExtension: extension,
              enrollment,
              authzData: res.locals.authz_data,
              requestedRole: 'Student Data Editor',
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
