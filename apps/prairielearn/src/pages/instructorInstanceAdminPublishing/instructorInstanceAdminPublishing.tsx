import assert from 'assert';
import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import z from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { loadSqlEquiv, queryRows, runInTransactionAsync } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { DatetimeLocalStringSchema } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { type AuthzData, assertHasRole } from '../../lib/authz-data-lib.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { isRenderableComment } from '../../lib/comments.js';
import { config } from '../../lib/config.js';
import { type CourseInstance, CourseInstanceAccessRuleSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
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

import { CourseInstancePublishing } from './components/CourseInstancePublishing.js';
import { LegacyAccessRuleCard } from './components/LegacyAccessRuleCard.js';
import { CourseInstancePublishingExtensionRowSchema } from './instructorInstanceAdminPublishing.types.js';
import { plainDateTimeStringToDate } from './utils/dateUtils.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

/**
 * Finds all publishing extensions for a course instance with user data.
 *
 * Only returns extensions for joined users.
 */
async function selectPublishingExtensionsWithUsersByCourseInstance({
  courseInstance,
  authzData,
  requiredRole,
}: {
  courseInstance: CourseInstance;
  authzData: AuthzData;
  requiredRole: ('System' | 'Student Data Viewer' | 'Student Data Editor')[];
}) {
  assertHasRole(authzData, requiredRole);
  return await queryRows(
    sql.select_publishing_extensions_with_users_by_course_instance,
    { course_instance_id: courseInstance.id },
    CourseInstancePublishingExtensionRowSchema,
  );
}

// Supports a client-side table refresh.
router.get(
  '/extension/data.json',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const { authz_data: authzData, course_instance: courseInstance } = extractPageContext(
      res.locals,
      {
        pageType: 'courseInstance',
        accessType: 'instructor',
      },
    );

    const { has_course_instance_permission_view: hasCourseInstancePermissionView } = authzData;

    if (!hasCourseInstancePermissionView) {
      throw new error.HttpStatusError(403, 'Access denied (must be a course instance viewer)');
    }

    const accessControlExtensions = await selectPublishingExtensionsWithUsersByCourseInstance({
      courseInstance,
      authzData,
      requiredRole: ['Student Data Viewer'],
    });
    res.json(accessControlExtensions);
  }),
);

// Validate a list of UIDs against enrollments in this course instance.
// Returns the list of UIDs that are NOT enrolled (invalidUids).
router.get(
  '/extension/check',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const { course_instance: courseInstance, authz_data: authzData } = extractPageContext(
      res.locals,
      {
        pageType: 'courseInstance',
        accessType: 'instructor',
      },
    );

    const { has_course_instance_permission_edit: hasCourseInstancePermissionEdit } = authzData;

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
      courseInstance,
      requiredRole: ['Student Data Viewer'],
      authzData,
    });
    const validUids = new Set(validRecords.map((record) => record.user.uid));
    const invalidUids = uids.filter((uid) => !validUids.has(uid));

    res.json({ invalidUids });
  }),
);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_view', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const {
      authz_data: authzData,
      __csrf_token: csrfToken,
      course_instance: courseInstance,
      course,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const {
      has_course_permission_edit: hasCoursePermissionEdit,
      has_course_instance_permission_edit: hasCourseInstancePermissionEdit,
      has_course_instance_permission_view: hasCourseInstancePermissionView,
    } = authzData;

    assert(hasCourseInstancePermissionEdit !== undefined);
    assert(hasCourseInstancePermissionView !== undefined);

    // Only fetch extensions if user has student data view permission
    const publishingExtensions = hasCourseInstancePermissionView
      ? await selectPublishingExtensionsWithUsersByCourseInstance({
          courseInstance,
          authzData,
          requiredRole: ['Student Data Viewer'],
        })
      : [];

    // Calculate orig_hash for the infoCourseInstance.json file
    const infoCourseInstancePath = path.join(
      course.path,
      'courseInstances',
      courseInstance.short_name,
      'infoCourseInstance.json',
    );
    const origHash = await getOriginalHash(infoCourseInstancePath);

    const accessRules = await queryRows(
      sql.course_instance_access_rules,
      { course_instance_id: courseInstance.id },
      CourseInstanceAccessRuleSchema,
    );

    const showComments = accessRules.some((access_rule) =>
      isRenderableComment(access_rule.json_comment),
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
        content: courseInstance.modern_publishing ? (
          <Hydrate>
            <CourseInstancePublishing
              courseInstance={courseInstance}
              canEditPublishing={
                hasCoursePermissionEdit && !course.example_course && origHash !== null
              }
              canViewExtensions={hasCourseInstancePermissionView}
              canEditExtensions={hasCoursePermissionEdit && hasCourseInstancePermissionEdit}
              csrfToken={csrfToken}
              origHash={origHash}
              extensions={publishingExtensions}
              isDevMode={config.devMode}
            />
          </Hydrate>
        ) : (
          <LegacyAccessRuleCard
            accessRules={accessRules}
            showComments={showComments}
            courseInstance={courseInstance}
            hasCourseInstancePermissionView={hasCourseInstancePermissionView}
          />
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course-instance'>(async (req, res) => {
    const {
      authz_data: authzData,
      course,
      course_instance: courseInstance,
      urlPrefix,
    } = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });

    const {
      has_course_permission_edit: hasCoursePermissionEdit,
      has_course_instance_permission_edit: hasCourseInstancePermissionEdit,
    } = authzData;

    if (req.body.__action === 'update_publishing') {
      if (!hasCoursePermissionEdit) {
        throw new error.HttpStatusError(403, 'Access denied (must be a course editor)');
      }
      if (!courseInstance.modern_publishing) {
        flash('error', 'Cannot update publishing when legacy allowAccess rules are present');
        res.redirect(req.originalUrl);
        return;
      }
      // Read the existing infoCourseInstance.json file
      const infoCourseInstancePath = path.join(
        course.path,
        'courseInstances',
        courseInstance.short_name,
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

      const parsedBody = z
        .object({
          start_date: z.union([z.literal(''), DatetimeLocalStringSchema]),
          end_date: z.union([z.literal(''), DatetimeLocalStringSchema]),
        })
        .parse(req.body);

      // Update the publishing settings
      const resolvedPublishing = {
        startDate: propertyValueWithDefault(
          courseInstanceInfo.publishing?.startDate,
          parsedBody.start_date,
          (v: string) => v === '',
        ),
        endDate: propertyValueWithDefault(
          courseInstanceInfo.publishing?.endDate,
          parsedBody.end_date,
          (v: string) => v === '',
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
        locals: res.locals,
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
        res.redirect(urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      flash('success', 'Publishing settings updated successfully');
      res.redirect(req.originalUrl);
      return;
    }

    if (req.accepts('html')) {
      throw new error.HttpStatusError(406, 'Not acceptable');
    }

    // Extension actions require both course editor and student data editor permissions
    if (!hasCoursePermissionEdit || !hasCourseInstancePermissionEdit) {
      throw new error.HttpStatusError(
        403,
        'Access denied (must be a course editor and student data editor)',
      );
    }

    if (req.body.__action === 'add_extension') {
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
      const addExtensionBodyResult = AddExtensionSchema.safeParse(req.body);
      if (!addExtensionBodyResult.success) {
        throw new error.HttpStatusError(400, 'Invalid request body');
      }
      const body = addExtensionBodyResult.data;

      const enrollments = (
        await selectUsersAndEnrollmentsByUidsInCourseInstance({
          uids: body.uids,
          courseInstance,
          requiredRole: ['Student Data Viewer'],
          authzData,
        })
      ).map((record) => record.enrollment);
      if (enrollments.length === 0) {
        throw new error.HttpStatusError(400, 'No enrollments found for any of the provided UIDs');
      }

      // Check if an extension with this name already exists
      if (body.name) {
        const existingExtension = await selectPublishingExtensionByName({
          name: body.name,
          courseInstance,
          authzData,
          requiredRole: ['Student Data Viewer'],
        });

        if (existingExtension) {
          throw new error.HttpStatusError(
            400,
            `An extension with the name "${body.name}" already exists`,
          );
        }
      }

      await createPublishingExtensionWithEnrollments({
        courseInstance,
        name: body.name,
        endDate: plainDateTimeStringToDate(body.end_date, courseInstance.display_timezone),
        enrollments,
        authzData,
        requiredRole: ['Student Data Editor'],
      });

      res.sendStatus(204);
      return;
    } else if (req.body.__action === 'delete_extension') {
      const deleteExtensionBodyResult = z
        .object({
          extension_id: z.string().trim().min(1),
        })
        .safeParse(req.body);
      if (!deleteExtensionBodyResult.success) {
        throw new error.HttpStatusError(400, 'Invalid request body');
      }
      const body = deleteExtensionBodyResult.data;

      const extension = await selectPublishingExtensionById({
        id: body.extension_id,
        courseInstance,
        requiredRole: ['Student Data Viewer'],
        authzData,
      });

      await deletePublishingExtension({
        extension,
        courseInstance,
        authzData,
        requiredRole: ['Student Data Editor'],
      });

      res.sendStatus(204);
      return;
    } else if (req.body.__action === 'edit_extension') {
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
      const editExtensionBodyResult = EditExtensionSchema.safeParse(req.body);
      if (!editExtensionBodyResult.success) {
        const errorMessages = editExtensionBodyResult.error.errors.map((error) => {
          if (error.path.length > 0) {
            const field = error.path.join('.');
            return `${field}: ${error.message}`;
          }
          return error.message;
        });
        throw new error.HttpStatusError(400, errorMessages.join(', '));
      }
      const body = editExtensionBodyResult.data;

      // Check if an extension with this name already exists (excluding the current one)
      if (body.name) {
        const existingExtension = await selectPublishingExtensionByName({
          name: body.name,
          courseInstance,
          authzData,
          requiredRole: ['Student Data Viewer'],
        });

        if (existingExtension && existingExtension.id !== body.extension_id) {
          throw new error.HttpStatusError(
            400,
            `An extension with the name "${body.name}" already exists`,
          );
        }
      }

      await runInTransactionAsync(async () => {
        const extension = await selectPublishingExtensionById({
          id: body.extension_id,
          courseInstance,
          requiredRole: ['Student Data Viewer'],
          authzData,
        });

        const desiredEnrollments = (
          await selectUsersAndEnrollmentsByUidsInCourseInstance({
            uids: body.uids,
            courseInstance,
            authzData,
            requiredRole: ['Student Data Viewer'],
          })
        ).map((record) => record.enrollment);

        if (desiredEnrollments.length === 0) {
          throw new Error('No enrollments found for provided UIDs');
        }

        await updatePublishingExtension({
          extension,
          name: body.name,
          endDate: body.end_date
            ? plainDateTimeStringToDate(body.end_date, courseInstance.display_timezone)
            : null,
          authzData,
          requiredRole: ['Student Data Editor'],
        });

        const currentEnrollments = await selectEnrollmentsForPublishingExtension({
          extension,
          authzData,
          requiredRole: ['Student Data Viewer'],
        });
        const desiredEnrollmentsIds = new Set(desiredEnrollments.map((e) => e.id));
        const currentEnrollmentsIds = new Set(currentEnrollments.map((e) => e.id));
        const enrollmentsToAdd = desiredEnrollments.filter((e) => !currentEnrollmentsIds.has(e.id));
        const enrollmentsToRemove = currentEnrollments.filter(
          (e) => !desiredEnrollmentsIds.has(e.id),
        );

        for (const enrollment of enrollmentsToRemove) {
          await removeStudentFromPublishingExtension({
            courseInstancePublishingExtension: extension,
            enrollment,
            authzData,
            requiredRole: ['Student Data Editor'],
          });
        }

        for (const enrollment of enrollmentsToAdd) {
          await addEnrollmentToPublishingExtension({
            courseInstancePublishingExtension: extension,
            enrollment,
            authzData,
            requiredRole: ['Student Data Editor'],
          });
        }
      });

      res.sendStatus(204);
      return;
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
