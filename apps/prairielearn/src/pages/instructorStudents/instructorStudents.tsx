import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { callRow, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { assertNever } from '@prairielearn/utils';
import { UniqueUidsFromStringSchema } from '@prairielearn/zod';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import { getSelfEnrollmentLinkUrl, getStudentCourseInstanceUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { getCanonicalHost, getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { inviteStudentByUid, selectOptionalEnrollmentByUid } from '../../models/enrollment.js';
import {
  addEnrollmentToStudentLabel,
  batchRemoveEnrollmentsFromStudentLabel,
  selectStudentLabelsByCourseInstance,
  verifyLabelBelongsToCourseInstance,
} from '../../models/student-label.js';
import { selectOptionalUserByUid } from '../../models/user.js';
import type { StudentLabelJson } from '../../schemas/infoCourseInstance.js';

import { InstructorStudents } from './instructorStudents.html.js';
import { StudentRowSchema } from './instructorStudents.shared.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

// Supports a client-side table refresh.
router.get(
  '/data.json',
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = pageContext;
    const students = await queryRows(
      sql.select_users_and_enrollments_for_course_instance,
      { course_instance_id: courseInstance.id },
      StudentRowSchema,
    );
    res.json(students);
  }),
);

router.get(
  '/enrollment.json',
  asyncHandler(async (req, res) => {
    if (req.accepts('html')) {
      throw new HttpStatusError(406, 'Not Acceptable');
    }

    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_view) {
      throw new HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const { course_instance: courseInstance } = pageContext;
    const { uid } = req.query;
    if (typeof uid !== 'string') {
      throw new HttpStatusError(400, 'UID must be a string');
    }
    const enrollment = await selectOptionalEnrollmentByUid({
      courseInstance,
      uid,
      requiredRole: ['Student Data Viewer'],
      authzData: res.locals.authz_data,
    });
    const staffEnrollment = StaffEnrollmentSchema.nullable().parse(enrollment);
    res.json(staffEnrollment);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.accepts('html')) {
      throw new HttpStatusError(406, 'Not Acceptable');
    }

    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    if (!pageContext.authz_data.has_course_instance_permission_edit) {
      throw new HttpStatusError(403, 'Access denied (must be an instructor)');
    }

    const { course_instance: courseInstance, course, authz_data: authzData } = pageContext;
    const {
      authn_user: { id: authnUserId },
      user: { id: userId },
    } = authzData;

    if (!courseInstance.modern_publishing) {
      throw new HttpStatusError(400, 'Modern publishing is not enabled for this course instance');
    }

    if (req.body.__action === 'invite_by_uid') {
      const BodySchema = z.object({
        uid: z.string().min(1),
        __action: z.literal('invite_by_uid'),
      });
      const body = BodySchema.parse(req.body);

      const user = await selectOptionalUserByUid(body.uid);

      if (user) {
        const isInstructor = await callRow(
          'users_is_instructor_in_course_instance',
          [user.id, courseInstance.id],
          z.boolean(),
        );

        if (isInstructor) {
          throw new HttpStatusError(400, 'The user is an instructor');
        }
      }

      // Try to find an existing enrollment so we can error gracefully.
      const existingEnrollment = await selectOptionalEnrollmentByUid({
        courseInstance,
        uid: body.uid,
        requiredRole: ['Student Data Viewer'],
        authzData: res.locals.authz_data,
      });

      if (existingEnrollment) {
        if (existingEnrollment.status === 'joined') {
          throw new HttpStatusError(400, 'The user is already enrolled');
        }

        if (existingEnrollment.status === 'invited') {
          throw new HttpStatusError(400, 'The user has an existing invitation');
        }
      }

      const enrollment = await inviteStudentByUid({
        courseInstance,
        uid: body.uid,
        requiredRole: ['Student Data Editor'],
        authzData: res.locals.authz_data,
      });

      const staffEnrollment = StaffEnrollmentSchema.parse(enrollment);

      res.json({ data: staffEnrollment });
    } else if (req.body.__action === 'batch_add_to_label') {
      const BodySchema = z.object({
        __action: z.literal('batch_add_to_label'),
        enrollment_ids: z.array(z.string()),
        student_label_id: z.string(),
      });
      const body = BodySchema.parse(req.body);

      // Verify the label belongs to this course instance
      await verifyLabelBelongsToCourseInstance(body.student_label_id, courseInstance.id);

      // Add each enrollment to the label
      let added = 0;
      let alreadyInLabel = 0;
      for (const enrollmentId of body.enrollment_ids) {
        const result = await addEnrollmentToStudentLabel({
          enrollment_id: enrollmentId,
          student_label_id: body.student_label_id,
        });
        if (result) {
          added++;
        } else {
          alreadyInLabel++;
        }
      }

      res.json({ success: true, added, alreadyInLabel });
    } else if (req.body.__action === 'create_label_and_add_students') {
      const BodySchema = z.object({
        __action: z.literal('create_label_and_add_students'),
        enrollment_ids: z.array(z.string()),
        name: z.string().min(1, 'Label name is required').max(255),
      });
      const body = BodySchema.parse(req.body);

      // Get paths for file operations
      const courseInstancePath = path.join(
        course.path,
        'courseInstances',
        courseInstance.short_name,
      );
      const courseInstanceJsonPath = path.join(courseInstancePath, 'infoCourseInstance.json');
      const paths = getPaths(undefined, res.locals);

      // Read current JSON
      const content = await fs.readFile(courseInstanceJsonPath, 'utf8');
      const courseInstanceJson = JSON.parse(content);
      const studentLabels: StudentLabelJson[] = courseInstanceJson.studentLabels ?? [];

      // Check if label name already exists
      if (studentLabels.some((l) => l.name === body.name)) {
        res.status(400).json({ error: 'A label with this name already exists' });
        return;
      }

      // Add new label with default color
      studentLabels.push({ name: body.name, color: 'gray1' });
      courseInstanceJson.studentLabels = studentLabels;

      // Compute origHash for optimistic concurrency
      const origHash = sha256(b64EncodeUnicode(content)).toString();

      // Format and write using FileModifyEditor
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInstanceJson));

      const editor = new FileModifyEditor({
        locals: {
          authz_data: res.locals.authz_data,
          course: res.locals.course,
          user: res.locals.user,
        },
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: courseInstanceJsonPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to save changes',
          jobSequenceId: serverJob.jobSequenceId,
        });
        return;
      }

      // After sync, add enrollments to the newly created label
      if (body.enrollment_ids.length > 0) {
        const labels = await selectStudentLabelsByCourseInstance(courseInstance.id);
        const newLabel = labels.find((l) => l.name === body.name);
        if (!newLabel) {
          throw new HttpStatusError(500, 'Label saved but not found in database');
        }
        for (const enrollmentId of body.enrollment_ids) {
          await addEnrollmentToStudentLabel({
            enrollment_id: enrollmentId,
            student_label_id: newLabel.id,
          });
        }
      }

      res.json({ success: true });
    } else if (req.body.__action === 'batch_remove_from_label') {
      const BodySchema = z.object({
        __action: z.literal('batch_remove_from_label'),
        enrollment_ids: z.array(z.string()),
        student_label_id: z.string(),
      });
      const body = BodySchema.parse(req.body);

      // Verify the label belongs to this course instance
      await verifyLabelBelongsToCourseInstance(body.student_label_id, courseInstance.id);

      // Remove enrollments from the label (returns count of removed)
      const removed = await batchRemoveEnrollmentsFromStudentLabel({
        enrollment_ids: body.enrollment_ids,
        student_label_id: body.student_label_id,
      });

      res.json({ success: true, removed });
    } else if (req.body.__action === 'invite_uids') {
      const BodySchema = z.object({
        uids: UniqueUidsFromStringSchema(1000),
        __action: z.literal('invite_uids'),
      });
      const body = BodySchema.parse(req.body);

      const serverJob = await createServerJob({
        type: 'invite_students',
        description: 'Invite students to course instance',
        userId,
        authnUserId,
        courseId: course.id,
        courseInstanceId: courseInstance.id,
      });

      serverJob.executeInBackground(async (job) => {
        const counts = {
          success: 0,
          instructor: 0,
          alreadyEnrolled: 0,
          alreadyInvited: 0,
          alreadyRemoved: 0,
          alreadyBlocked: 0,
        };

        for (const uid of body.uids) {
          const user = await selectOptionalUserByUid(uid);
          if (user) {
            // Check if user is an instructor
            const isInstructor = await callRow(
              'users_is_instructor_in_course_instance',
              [user.id, courseInstance.id],
              z.boolean(),
            );
            if (isInstructor) {
              job.info(`${uid}: Skipped (instructor)`);
              counts.instructor++;
              continue;
            }
          }

          const existingEnrollment = await selectOptionalEnrollmentByUid({
            courseInstance,
            uid,
            requiredRole: ['Student Data Viewer'],
            authzData,
          });

          if (existingEnrollment) {
            switch (existingEnrollment.status) {
              case 'joined': {
                job.info(`${uid}: Skipped (already enrolled)`);
                counts.alreadyEnrolled++;
                continue;
              }
              case 'invited': {
                job.info(`${uid}: Skipped (already invited)`);
                counts.alreadyInvited++;
                continue;
              }
              case 'removed': {
                job.info(`${uid}: Skipped (removed)`);
                counts.alreadyRemoved++;
                continue;
              }
              case 'blocked': {
                job.info(`${uid}: Skipped (blocked)`);
                counts.alreadyBlocked++;
                continue;
              }
              case 'lti13_pending': {
                // We don't currently have any `lti13_pending` enrollments, so we'll just
                // ignore this for now. We should have this better once we support LTI 1.3
                // roster syncing.
                continue;
              }
              case 'left':
              case 'rejected': {
                // We can re-invite these users below.
                break;
              }
              default: {
                assertNever(existingEnrollment.status);
              }
            }
          }

          await inviteStudentByUid({
            courseInstance,
            uid,
            requiredRole: ['Student Data Editor'],
            authzData,
          });
          job.info(`${uid}: Invited`);
          counts.success++;
        }

        // Log summary at the end
        job.info('\nSummary:');
        job.info(`  Successfully invited: ${counts.success}`);
        if (counts.alreadyEnrolled > 0) {
          job.info(`  Skipped (already enrolled): ${counts.alreadyEnrolled}`);
        }
        if (counts.alreadyInvited > 0) {
          job.info(`  Skipped (already invited): ${counts.alreadyInvited}`);
        }
        if (counts.alreadyRemoved > 0) {
          job.info(`  Skipped (removed): ${counts.alreadyRemoved}`);
        }
        if (counts.alreadyBlocked > 0) {
          job.info(`  Skipped (blocked): ${counts.alreadyBlocked}`);
        }
        if (counts.instructor > 0) {
          job.info(`  Skipped (instructor): ${counts.instructor}`);
        }
      });

      res.json({ job_sequence_id: serverJob.jobSequenceId });
    } else {
      throw new HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'passthrough',
  }),
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'courseInstance',
      accessType: 'instructor',
    });
    const {
      authz_data,
      __csrf_token: csrfToken,
      course_instance: courseInstance,
      course,
    } = pageContext;

    const search = getUrl(req).search;

    if (!authz_data.has_course_instance_permission_view) {
      const courseOwners = await getCourseOwners(course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          navContext: {
            type: 'instructor',
            page: 'instance_admin',
            subPage: 'students',
          },
          courseOwners,
          pageTitle: 'Students',
          requiredPermissions: 'Student Data Viewer',
        }),
      );
      return;
    }

    const [students, allStudentLabels] = await Promise.all([
      queryRows(
        sql.select_users_and_enrollments_for_course_instance,
        { course_instance_id: courseInstance.id },
        StudentRowSchema,
      ),
      selectStudentLabelsByCourseInstance(courseInstance.id),
    ]);

    // Transform student labels to match the expected format
    const studentLabels = allStudentLabels.map((l) => ({ id: l.id, name: l.name, color: l.color }));

    const host = getCanonicalHost(req);
    const selfEnrollLink = new URL(
      courseInstance.self_enrollment_use_enrollment_code
        ? getSelfEnrollmentLinkUrl({
            courseInstanceId: courseInstance.id,
            enrollmentCode: courseInstance.enrollment_code,
          })
        : getStudentCourseInstanceUrl(courseInstance.id),
      host,
    ).href;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Students',
        navContext: {
          type: 'instructor',
          page: 'students',
          subPage: 'students',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <Hydrate fullHeight>
            <InstructorStudents
              isDevMode={config.devMode}
              authzData={authz_data}
              students={students}
              studentLabels={studentLabels}
              search={search}
              timezone={course.display_timezone}
              courseInstance={courseInstance}
              course={course}
              csrfToken={csrfToken}
              selfEnrollLink={selfEnrollLink}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
