import { z } from 'zod';

import { formatDateFriendly } from '@prairielearn/formatter';
import { callScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import type {
  CourseInstancePublishingExtension,
  Enrollment,
  EnumEnrollmentStatus,
} from '../../../../lib/db-types.js';
import { idsEqual } from '../../../../lib/id.js';
import {
  createPublishingExtensionWithEnrollments,
  deletePublishingExtension,
  selectEnrollmentsForPublishingExtension,
  selectOptionalPublishingExtensionById,
  selectPublishingExtensionByName,
  updatePublishingExtension,
  updatePublishingExtensionEnrollments,
} from '../../../../models/course-instance-publishing-extensions.js';
import {
  deleteEnrollment,
  inviteStudentByUid,
  selectEnrollmentsByUidsOrPendingUidsInCourseInstance,
  selectUsersAndEnrollmentsByUidsInCourseInstance,
  setEnrollmentStatus,
} from '../../../../models/enrollment.js';
import {
  addLabelToEnrollments,
  removeLabelFromEnrollments,
  selectStudentLabelsInCourseInstance,
} from '../../../../models/student-label.js';
import { selectOptionalUserByUid } from '../../../../models/user.js';
import { plainDateTimeStringToDate } from '../../../../pages/instructorInstanceAdminPublishing/utils/dateUtils.js';

import {
  COURSE_INSTANCE_INPUT,
  CourseActionError,
  type CourseInstanceActionContext,
  count,
  courseInstanceAction,
  requireRole,
} from './action.js';

// The PrairieLearn pages take up to 1000 UIDs at a time.
const UidsSchema = z
  .array(z.email())
  .min(1)
  .max(1000)
  .describe(
    'UIDs of the students, as the instructor gave them, such as student@example.edu. Course data does not include UIDs.',
  );

const StudentsInputSchema = z.strictObject({ ...COURSE_INSTANCE_INPUT, uids: UidsSchema });

function list(items: string[]) {
  return `${items.slice(0, 20).join(', ')}${items.length > 20 ? ', …' : ''}`;
}

function refuseMissing(ctx: CourseInstanceActionContext, missing: string[]) {
  if (missing.length === 0) return;
  throw new CourseActionError(
    `The course instance "${ctx.course_instance.short_name}" has no student with UID ${list(missing)}. Check these UIDs with the instructor.`,
  );
}

/**
 * The enrollment of each UID, including invitations not yet accepted. The request is refused if a
 * UID has none.
 */
async function selectStudents(ctx: CourseInstanceActionContext, uids: string[]) {
  const unique = [...new Set(uids)];
  const rows = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
    uids: unique,
    courseInstance: ctx.course_instance,
    requiredRole: ['Student Data Editor'],
    authzData: ctx.authz_data,
  });
  const byUid = new Map(rows.map((row) => [row.uid, row.enrollment]));
  refuseMissing(
    ctx,
    unique.filter((uid) => !byUid.has(uid)),
  );
  return unique.map((uid) => ({ uid, enrollment: byUid.get(uid)! }));
}

/**
 * An action that changes students' enrollment status, as the student detail page does for one
 * student. Students already in the resulting status are left as they are; any other status the
 * page does not allow refuses the request.
 */
function statusAction({
  description,
  from,
  result,
  done,
  apply,
}: {
  description: string;
  from: EnumEnrollmentStatus[];
  result: EnumEnrollmentStatus | null;
  done: string;
  apply: (ctx: CourseInstanceActionContext, enrollment: Enrollment) => Promise<unknown>;
}) {
  return courseInstanceAction({
    description,
    requiredRole: ['Student Data Editor'],
    input: StudentsInputSchema,
    run: async ({ ctx, input }) => {
      const students = await selectStudents(ctx, input.uids);
      const disallowed = students.filter(
        ({ enrollment }) => !from.includes(enrollment.status) && enrollment.status !== result,
      );
      if (disallowed.length > 0) {
        throw new CourseActionError(
          `This applies only to students who are ${from.join(' or ')}, and ${list(
            disallowed.map(({ uid, enrollment }) => `${uid} is ${enrollment.status}`),
          )}. Leave them out of the request.`,
        );
      }
      const changing = students.filter(({ enrollment }) => from.includes(enrollment.status));
      for (const { enrollment } of changing) await apply(ctx, enrollment);
      const unchanged = students.length - changing.length;
      return {
        summary: `${done} ${count(changing.length, 'student')}${
          unchanged > 0 ? ` (${count(unchanged, 'other student')} already ${result})` : ''
        }.`,
      };
    },
  });
}

const LabelInputSchema = z.strictObject({
  ...COURSE_INSTANCE_INPUT,
  label_name: z
    .string()
    .min(1)
    .describe(
      'Name of an existing student label in the course instance, from "studentLabels" in its infoCourseInstance.json.',
    ),
  uids: UidsSchema,
});

async function selectLabel(ctx: CourseInstanceActionContext, name: string) {
  const labels = await selectStudentLabelsInCourseInstance(ctx.course_instance);
  const label = labels.find((candidate) => candidate.name === name);
  if (!label) {
    throw new CourseActionError(
      labels.length > 0
        ? `The course instance "${ctx.course_instance.short_name}" has no student label named "${name}". Its labels are: ${labels.map((l) => `"${l.name}"`).join(', ')}.`
        : `The course instance "${ctx.course_instance.short_name}" has no student labels. Add one to "studentLabels" in its infoCourseInstance.json, and save the change, first.`,
    );
  }
  return label;
}

// Written out rather than reusing DatetimeLocalStringSchema, whose transforms the JSON Schema
// shown to the course agent cannot express.
const ExtensionEndDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/,
    'Use the form YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS.',
  )
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Use a real date and time.')
  .describe(
    "When the students' access ends, as a local date and time in the course instance's timezone (its display_timezone), such as 2025-05-20T23:59:00, with no offset.",
  );

const ExtensionNameSchema = z
  .string()
  .trim()
  .min(1)
  .describe('A name for the extension, unique in the course instance, such as "Makeup week".');

const ExtensionIdSchema = IdSchema.describe(
  'ID of the extension, from the extension_id column of the publishing_extension_students dataset.',
);

/** The enrollments of students with a PrairieLearn account, which is whom an extension can cover. */
async function selectExtensionEnrollments(ctx: CourseInstanceActionContext, uids: string[]) {
  const unique = [...new Set(uids)];
  const rows = await selectUsersAndEnrollmentsByUidsInCourseInstance({
    uids: unique,
    courseInstance: ctx.course_instance,
    requiredRole: ['Student Data Viewer'],
    authzData: ctx.authz_data,
  });
  const found = new Set(rows.map(({ user }) => user.uid));
  refuseMissing(
    ctx,
    unique.filter((uid) => !found.has(uid)),
  );
  return rows.map(({ enrollment }) => enrollment);
}

async function refuseDuplicateName(
  ctx: CourseInstanceActionContext,
  name: string,
  extension?: CourseInstancePublishingExtension,
) {
  const existing = await selectPublishingExtensionByName({
    name,
    courseInstance: ctx.course_instance,
  });
  if (existing && !(extension && idsEqual(existing.id, extension.id))) {
    throw new CourseActionError(
      `The course instance already has an extension named "${name}". Use another name.`,
    );
  }
}

async function selectExtension(ctx: CourseInstanceActionContext, id: string) {
  const extension = await selectOptionalPublishingExtensionById({
    id,
    courseInstance: ctx.course_instance,
  });
  if (!extension) {
    throw new CourseActionError(
      `The course instance "${ctx.course_instance.short_name}" has no extension with ID ${id}. Find one in the publishing_extension_students dataset.`,
    );
  }
  return extension;
}

function describeExtension(extension: CourseInstancePublishingExtension) {
  return extension.name === null ? 'the extension' : `the extension "${extension.name}"`;
}

function formatEndDate(ctx: CourseInstanceActionContext, date: Date) {
  return formatDateFriendly(date, ctx.course_instance.display_timezone);
}

export const studentActions = {
  students_invite: courseInstanceAction({
    description:
      "Invite students to the course instance by UID, as the Students page's invite does. Each person joins by accepting the invitation in PrairieLearn. Course staff, and students who are already joined, invited, blocked, or removed, are skipped; re-enroll blocked or removed students with students_reenroll.",
    requiredRole: ['Student Data Editor'],
    input: StudentsInputSchema,
    run: async ({ ctx, input }) => {
      if (!ctx.course_instance.modern_publishing) {
        throw new CourseActionError(
          'This course instance uses the older access rules, under which students cannot be invited. Tell the instructor.',
        );
      }
      const uids = [...new Set(input.uids)];
      const rows = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
        uids,
        courseInstance: ctx.course_instance,
        requiredRole: ['Student Data Editor'],
        authzData: ctx.authz_data,
      });
      const statusByUid = new Map(rows.map((row) => [row.uid, row.enrollment.status]));
      let invited = 0;
      let staff = 0;
      const skipped = new Map<EnumEnrollmentStatus, number>();
      for (const uid of uids) {
        const user = await selectOptionalUserByUid(uid);
        if (
          user &&
          (await callScalar(
            'users_is_instructor_in_course_instance',
            [user.id, ctx.course_instance.id],
            z.boolean(),
          ))
        ) {
          staff++;
          continue;
        }
        const status = statusByUid.get(uid);
        // As on the Students page, only declined or left invitations are sent again.
        if (status !== undefined && status !== 'rejected' && status !== 'left') {
          skipped.set(status, (skipped.get(status) ?? 0) + 1);
          continue;
        }
        await inviteStudentByUid({
          uid,
          requiredRole: ['Student Data Editor'],
          authzData: ctx.authz_data,
          courseInstance: ctx.course_instance,
        });
        invited++;
      }
      const skips = [
        ...(staff > 0 ? [count(staff, 'course staff member')] : []),
        ...[...skipped].map(([status, n]) => `${n} already ${status}`),
      ];
      return {
        summary: `Invited ${count(invited, 'student')}${skips.length > 0 ? `, and skipped ${skips.join(', ')}` : ''}.`,
      };
    },
  }),
  students_cancel_invitation: statusAction({
    description:
      'Cancel invitations that have not been accepted, or were declined, as the student detail page does. The students are no longer listed.',
    from: ['invited', 'rejected'],
    result: null,
    done: 'Cancelled the invitation of',
    apply: (ctx, enrollment) =>
      deleteEnrollment({
        enrollment,
        actionDetail: 'invitation_deleted',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_block: statusAction({
    description:
      'Block joined students from the course instance, as the student detail page does. Their work is kept, and they cannot open the course instance until re-enrolled.',
    from: ['joined'],
    result: 'blocked',
    done: 'Blocked',
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'blocked',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_reenroll: statusAction({
    description:
      'Re-enroll blocked or removed students, as the student detail page does, so they can open the course instance again with their earlier work.',
    from: ['blocked', 'removed'],
    result: 'joined',
    done: 'Re-enrolled',
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'joined',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  student_labels_add_students: courseInstanceAction({
    description:
      'Add students to an existing student label, as the Students page does. Labels themselves are defined in the course files.',
    requiredRole: ['Student Data Editor'],
    input: LabelInputSchema,
    run: async ({ ctx, input }) => {
      const label = await selectLabel(ctx, input.label_name);
      const students = await selectStudents(ctx, input.uids);
      const added = await addLabelToEnrollments({
        enrollments: students.map(({ enrollment }) => enrollment),
        label,
        authzData: ctx.authz_data,
      });
      const already = students.length - added.length;
      return {
        summary: `Added ${count(added.length, 'student')} to the label "${label.name}"${
          already > 0 ? ` (${count(already, 'other student')} already had it)` : ''
        }.`,
      };
    },
  }),
  student_labels_remove_students: courseInstanceAction({
    description: 'Remove students from a student label, as the Students page does.',
    requiredRole: ['Student Data Editor'],
    input: LabelInputSchema,
    run: async ({ ctx, input }) => {
      const label = await selectLabel(ctx, input.label_name);
      const students = await selectStudents(ctx, input.uids);
      const removed = await removeLabelFromEnrollments({
        enrollments: students.map(({ enrollment }) => enrollment),
        label,
        authzData: ctx.authz_data,
      });
      const without = students.length - removed.length;
      return {
        summary: `Removed ${count(removed.length, 'student')} from the label "${label.name}"${
          without > 0 ? ` (${count(without, 'other student')} did not have it)` : ''
        }.`,
      };
    },
  }),
  extensions_add: courseInstanceAction({
    description:
      'Give students access to the course instance after it closes for everyone else, as the Publishing page\'s "Add extension" does. Each assessment still follows its own dates.',
    requiredRole: ['Student Data Editor'],
    input: z.strictObject({
      ...COURSE_INSTANCE_INPUT,
      name: ExtensionNameSchema.optional().describe(
        'A name for the extension, unique in the course instance, such as "Makeup week". Optional.',
      ),
      end_date: ExtensionEndDateSchema,
      uids: UidsSchema,
    }),
    run: async ({ ctx, input }) => {
      // The Publishing page needs Editor access as well as Student Data Editor.
      requireRole(ctx, ['Editor']);
      const { course_instance } = ctx;
      // The Publishing page offers extensions only with the newer access rules.
      if (!course_instance.modern_publishing) {
        throw new CourseActionError(
          'This course instance uses the older access rules, which have no extensions. Tell the instructor.',
        );
      }
      const endDate = plainDateTimeStringToDate(input.end_date, course_instance.display_timezone);
      if (course_instance.publishing_end_date && endDate <= course_instance.publishing_end_date) {
        throw new CourseActionError(
          `The course instance is open to everyone until ${formatEndDate(ctx, course_instance.publishing_end_date)}, so an extension must end later than that.`,
        );
      }
      if (input.name !== undefined) await refuseDuplicateName(ctx, input.name);
      const enrollments = await selectExtensionEnrollments(ctx, input.uids);
      const extension = await createPublishingExtensionWithEnrollments({
        courseInstance: course_instance,
        name: input.name ?? null,
        endDate,
        enrollments,
      });
      return {
        summary: `Added ${describeExtension(extension)}, giving ${count(enrollments.length, 'student')} access until ${formatEndDate(ctx, endDate)}.`,
      };
    },
  }),
  extensions_edit: courseInstanceAction({
    description:
      "Change an extension's name, end date, or students, as the Publishing page does. Give only what changes.",
    requiredRole: ['Student Data Editor'],
    input: z.strictObject({
      ...COURSE_INSTANCE_INPUT,
      extension_id: ExtensionIdSchema,
      name: ExtensionNameSchema.optional().describe(
        'A new name for the extension, unique in the course instance. Omit to keep its name.',
      ),
      end_date: ExtensionEndDateSchema.optional().describe(
        "A new end of the students' access, as a local date and time in the course instance's timezone (its display_timezone), such as 2025-05-20T23:59:00, with no offset. Omit to keep it.",
      ),
      uids: UidsSchema.optional().describe(
        'UIDs of every student the extension should cover afterwards, as the instructor gave them. Students left out are taken out of the extension. Omit to keep its students.',
      ),
    }),
    run: async ({ ctx, input }) => {
      requireRole(ctx, ['Editor']);
      const extension = await selectExtension(ctx, input.extension_id);
      if (input.name === undefined && input.end_date === undefined && input.uids === undefined) {
        throw new CourseActionError('Give a new name, end_date, or uids.');
      }
      if (input.name !== undefined) await refuseDuplicateName(ctx, input.name, extension);
      const desired = input.uids && (await selectExtensionEnrollments(ctx, input.uids));
      const updated = await updatePublishingExtension({
        extension,
        name: input.name ?? extension.name,
        endDate:
          input.end_date === undefined
            ? extension.end_date
            : plainDateTimeStringToDate(input.end_date, ctx.course_instance.display_timezone),
      });
      const current = await selectEnrollmentsForPublishingExtension({ extension });
      if (desired) {
        const desiredIds = new Set(desired.map(({ id }) => id));
        const currentIds = new Set(current.map(({ id }) => id));
        await updatePublishingExtensionEnrollments({
          courseInstancePublishingExtension: extension,
          enrollmentsToAdd: desired.filter(({ id }) => !currentIds.has(id)),
          enrollmentsToRemove: current.filter(({ id }) => !desiredIds.has(id)),
        });
      }
      return {
        summary: `Updated ${describeExtension(updated)}, which now gives ${count((desired ?? current).length, 'student')} access until ${formatEndDate(ctx, updated.end_date)}.`,
      };
    },
  }),
  extensions_remove: courseInstanceAction({
    description:
      'Remove an extension, as the Publishing page does, so its students lose access when everyone else does.',
    requiredRole: ['Student Data Editor'],
    input: z.strictObject({ ...COURSE_INSTANCE_INPUT, extension_id: ExtensionIdSchema }),
    run: async ({ ctx, input }) => {
      requireRole(ctx, ['Editor']);
      const extension = await selectExtension(ctx, input.extension_id);
      const students = await selectEnrollmentsForPublishingExtension({ extension });
      await deletePublishingExtension({ extension, courseInstance: ctx.course_instance });
      return {
        summary: `Removed ${describeExtension(extension)}, which covered ${count(students.length, 'student')}.`,
      };
    },
  }),
};
