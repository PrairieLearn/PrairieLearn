import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { callRow, loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { assertNever } from '@prairielearn/utils';
import { UniqueUidsFromStringSchema } from '@prairielearn/zod';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { PageLayout } from '../../components/PageLayout.js';
import type { AuthzDataWithEffectiveUser } from '../../lib/authz-data-lib.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffEnrollmentSchema } from '../../lib/client/safe-db-types.js';
import { getSelfEnrollmentLinkUrl, getStudentCourseInstanceUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { getCourseOwners } from '../../lib/course.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { type ServerJobLogger, createServerJob } from '../../lib/server-jobs.js';
import { getCanonicalHost, getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import {
  deleteEnrollment,
  inviteStudentByUid,
  reenrollEnrollmentFromSync,
  removeEnrollmentFromSync,
  selectOptionalEnrollmentByUid,
} from '../../models/enrollment.js';
import { selectOptionalUserByUid } from '../../models/user.js';

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

const InviteUidsBodySchema = z.object({
  __action: z.literal('invite_uids'),
  uids: UniqueUidsFromStringSchema(1000),
});

const SyncStudentsBodySchema = z.object({
  __action: z.literal('sync_students'),
  toInvite: z.array(z.string().email()).max(5000),
  toCancelInvitation: z.array(z.string().email()).max(5000),
  toRemove: z.array(z.string().email()).max(5000),
});

const BodySchema = z.discriminatedUnion('__action', [InviteUidsBodySchema, SyncStudentsBodySchema]);

interface InviteCounts {
  invited: number;
  unblocked: number;
  reenrolled: number;
  skippedLti13Pending: number;
  skippedInstructor: number;
  skippedAlreadyInvited: number;
  skippedAlreadyJoined: number;
  skippedAlreadyBlocked: number;
  skippedAlreadyRemoved: number;
  errors: number;
}

/**
 * Process invitations for a list of UIDs.
 */
async function processInvitations({
  uids,
  courseInstance,
  authzData,
  job,
  counts,
  skipBlocked,
  allowReenroll,
  actionDetail = 'invited',
}: {
  uids: string[];
  courseInstance: CourseInstance;
  authzData: AuthzDataWithEffectiveUser;
  job: ServerJobLogger;
  counts: InviteCounts;
  /**
   * If true, skips students who are currently blocked. This is useful for `invite_uids`.
   * If false, blocked students can be handled by `allowReenroll` in `sync_students`.
   */
  skipBlocked: boolean;
  /**
   * If true, re-enrolls blocked/removed students. This is useful for `sync_students`.
   * If false, skips blocked/removed students. This is useful for `invite_uids`.
   */
  allowReenroll: boolean;
  actionDetail?: 'invited' | 'invited_by_manual_sync';
}): Promise<void> {
  for (const uid of uids) {
    try {
      const user = await selectOptionalUserByUid(uid);
      if (user) {
        const isInstructor = await callRow(
          'users_is_instructor_in_course_instance',
          [user.id, courseInstance.id],
          z.boolean(),
        );
        if (isInstructor) {
          job.info(`${uid}: Skipped (instructor)`);
          counts.skippedInstructor++;
          continue;
        }
      }

      const existingEnrollment = await selectOptionalEnrollmentByUid({
        courseInstance,
        uid,
        requiredRole: ['Student Data Viewer'],
        authzData,
      });

      if (existingEnrollment?.status === 'joined') {
        job.info(`${uid}: Skipped (already enrolled)`);
        counts.skippedAlreadyJoined++;
        continue;
      }
      if (existingEnrollment?.status === 'invited') {
        job.info(`${uid}: Skipped (already invited)`);
        counts.skippedAlreadyInvited++;
        continue;
      }
      if (existingEnrollment?.status === 'lti13_pending') {
        // TODO: this is intentionally skipped until LTI roster syncing is supported.
        // Once it exists, handle this status from the LTI source of truth.
        job.info(`${uid}: Skipped (LTI-managed enrollment)`);
        counts.skippedLti13Pending++;
        continue;
      }
      if (skipBlocked && existingEnrollment?.status === 'blocked') {
        job.info(`${uid}: Skipped (blocked)`);
        counts.skippedAlreadyBlocked++;
        continue;
      }
      if (!allowReenroll && existingEnrollment?.status === 'removed') {
        job.info(`${uid}: Skipped (removed)`);
        counts.skippedAlreadyRemoved++;
        continue;
      }

      if (allowReenroll && existingEnrollment?.status === 'blocked') {
        await reenrollEnrollmentFromSync({
          enrollment: existingEnrollment,
          authzData,
          requiredRole: ['Student Data Editor'],
        });
        job.info(`${uid}: Unblocked`);
        counts.unblocked++;
        continue;
      }

      if (allowReenroll && existingEnrollment?.status === 'removed') {
        await reenrollEnrollmentFromSync({
          enrollment: existingEnrollment,
          authzData,
          requiredRole: ['Student Data Editor'],
        });
        job.info(`${uid}: Reenrolled`);
        counts.reenrolled++;
        continue;
      }

      await inviteStudentByUid({
        courseInstance,
        uid,
        requiredRole: ['Student Data Editor'],
        authzData,
        actionDetail,
      });
      job.info(`${uid}: Invited`);
      counts.invited++;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      job.error(`${uid}: Error - ${message}`);
      counts.errors++;
    }
  }
}

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

    const body = BodySchema.parse(req.body);

    switch (body.__action) {
      case 'invite_uids': {
        const serverJob = await createServerJob({
          type: 'invite_students',
          description: 'Invite students to course instance',
          userId,
          authnUserId,
          courseId: course.id,
          courseInstanceId: courseInstance.id,
        });

        serverJob.executeInBackground(async (job) => {
          const counts: InviteCounts = {
            invited: 0,
            unblocked: 0,
            reenrolled: 0,
            skippedLti13Pending: 0,
            skippedInstructor: 0,
            skippedAlreadyInvited: 0,
            skippedAlreadyJoined: 0,
            skippedAlreadyBlocked: 0,
            skippedAlreadyRemoved: 0,
            errors: 0,
          };

          await processInvitations({
            uids: body.uids,
            courseInstance,
            authzData,
            job,
            counts,
            skipBlocked: true, // invite_uids respects existing blocks
            allowReenroll: false,
          });

          // Log summary at the end
          job.info('\nSummary:');
          job.info(`  Successfully invited: ${counts.invited}`);
          const summaryLines: [number, string][] = [
            [counts.skippedAlreadyJoined, 'Skipped (already enrolled)'],
            [counts.skippedAlreadyInvited, 'Skipped (already invited)'],
            [counts.skippedAlreadyBlocked, 'Skipped (blocked)'],
            [counts.skippedAlreadyRemoved, 'Skipped (removed)'],
            [counts.skippedLti13Pending, 'Skipped (LTI-managed)'],
            [counts.skippedInstructor, 'Skipped (instructor)'],
            [counts.errors, 'Errors'],
          ];
          for (const [count, label] of summaryLines) {
            if (count > 0) {
              job.info(`  ${label}: ${count}`);
            }
          }
        });

        res.json({ job_sequence_id: serverJob.jobSequenceId });
        break;
      }
      case 'sync_students': {
        const { toInvite, toCancelInvitation, toRemove } = body;

        const serverJob = await createServerJob({
          type: 'sync_students',
          description: 'Synchronize student list',
          userId,
          authnUserId,
          courseId: course.id,
          courseInstanceId: courseInstance.id,
        });

        serverJob.executeInBackground(async (job) => {
          const syncCounts: InviteCounts = {
            invited: 0,
            unblocked: 0,
            reenrolled: 0,
            skippedLti13Pending: 0,
            skippedInstructor: 0,
            skippedAlreadyInvited: 0,
            skippedAlreadyJoined: 0,
            skippedAlreadyBlocked: 0,
            skippedAlreadyRemoved: 0,
            errors: 0,
          };
          let cancelled = 0;
          let cancelErrors = 0;
          let removed = 0;
          let removeErrors = 0;

          // Process invitations
          if (toInvite.length > 0) {
            job.info('Processing invitations...');
            await processInvitations({
              uids: toInvite,
              courseInstance,
              authzData,
              job,
              counts: syncCounts,
              skipBlocked: false, // sync_students can re-invite blocked students
              allowReenroll: true,
              actionDetail: 'invited_by_manual_sync',
            });
          }

          // Process invitation cancellations
          if (toCancelInvitation.length > 0) {
            job.info('\nCancelling invitations...');
            for (const uid of toCancelInvitation) {
              try {
                const enrollment = await selectOptionalEnrollmentByUid({
                  courseInstance,
                  uid,
                  requiredRole: ['Student Data Viewer'],
                  authzData,
                });

                if (!enrollment) {
                  job.info(`${uid}: Skipped (no enrollment found)`);
                  continue;
                }
                if (!['invited', 'rejected'].includes(enrollment.status)) {
                  job.info(`${uid}: Skipped (not an invitation)`);
                  continue;
                }

                await deleteEnrollment({
                  enrollment,
                  actionDetail: 'invitation_deleted_by_manual_sync',
                  authzData,
                  requiredRole: ['Student Data Editor'],
                });
                job.info(`${uid}: Invitation cancelled`);
                cancelled++;
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                job.error(`${uid}: Error - ${message}`);
                cancelErrors++;
              }
            }
          }

          // Process removals
          if (toRemove.length > 0) {
            job.info('\nProcessing removals...');
            for (const uid of toRemove) {
              try {
                const enrollment = await selectOptionalEnrollmentByUid({
                  courseInstance,
                  uid,
                  requiredRole: ['Student Data Viewer'],
                  authzData,
                });

                if (!enrollment) {
                  job.info(`${uid}: Skipped (no enrollment found)`);
                  continue;
                }
                if (enrollment.status === 'removed') {
                  job.info(`${uid}: Skipped (already removed)`);
                  continue;
                }

                await removeEnrollmentFromSync({
                  enrollment,
                  authzData,
                  requiredRole: ['Student Data Editor'],
                });
                job.info(`${uid}: Removed`);
                removed++;
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                job.error(`${uid}: Error - ${message}`);
                removeErrors++;
              }
            }
          }

          // Log summary at the end
          job.info('\nSummary:');
          job.info(`  Invited: ${syncCounts.invited}`);
          job.info(`  Invitations cancelled: ${cancelled}`);
          job.info(`  Removed: ${removed}`);
          const totalErrors = syncCounts.errors + cancelErrors + removeErrors;
          const syncSummaryLines: [number, string][] = [
            [syncCounts.unblocked, 'Unblocked'],
            [syncCounts.reenrolled, 'Reenrolled'],
            [syncCounts.skippedAlreadyJoined, 'Skipped (already joined)'],
            [syncCounts.skippedAlreadyInvited, 'Skipped (already invited)'],
            [syncCounts.skippedLti13Pending, 'Skipped (LTI-managed)'],
            [syncCounts.skippedInstructor, 'Skipped (instructor)'],
            [totalErrors, 'Errors'],
          ];
          for (const [count, label] of syncSummaryLines) {
            if (count > 0) {
              job.info(`  ${label}: ${count}`);
            }
          }
        });

        res.json({ job_sequence_id: serverJob.jobSequenceId });
        break;
      }
      default: {
        assertNever(body);
      }
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

    const students = await queryRows(
      sql.select_users_and_enrollments_for_course_instance,
      { course_instance_id: courseInstance.id },
      StudentRowSchema,
    );

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
          page: 'instance_admin',
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
