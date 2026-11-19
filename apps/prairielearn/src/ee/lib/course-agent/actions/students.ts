import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { callScalar, runInTransactionAsync } from '@prairielearn/postgres';

import type { Enrollment, EnumEnrollmentStatus } from '../../../../lib/db-types.js';
import {
  createPublishingExtensionWithEnrollments,
  deletePublishingExtension,
  selectEnrollmentsForPublishingExtension,
  selectPublishingExtensionByName,
  updatePublishingExtension,
  updatePublishingExtensionEnrollments,
} from '../../../../models/course-instance-publishing-extensions.js';
import {
  deleteEnrollment,
  inviteStudentByUid,
  selectEnrollmentsByUidsOrPendingUidsInCourseInstance,
  setEnrollmentStatus,
} from '../../../../models/enrollment.js';
import {
  addLabelToEnrollments,
  removeLabelFromEnrollments,
  selectStudentLabelsInCourseInstance,
} from '../../../../models/student-label.js';
import { selectOptionalUserByUid } from '../../../../models/user.js';

import {
  COURSE_INSTANCE_INPUT,
  CourseActionError,
  type CourseInstanceActionContext,
  count,
  courseInstanceAction,
} from './action.js';

const UidsSchema = z
  .array(z.email().max(256))
  .min(1)
  .max(200)
  .describe(
    'UIDs of the students, such as student@example.edu, from the uid column of the students dataset.',
  );

const StudentsInputSchema = z.strictObject({ ...COURSE_INSTANCE_INPUT, uids: UidsSchema });

const some = (uids: string[]) => `${uids.slice(0, 20).join(', ')}${uids.length > 20 ? ', …' : ''}`;

/** Each UID with its enrollment in the course instance, or null when it has none. */
async function selectEnrollments(ctx: CourseInstanceActionContext, uids: string[]) {
  const unique = [...new Set(uids)];
  const rows = await selectEnrollmentsByUidsOrPendingUidsInCourseInstance({
    uids: unique,
    courseInstance: ctx.course_instance,
    requiredRole: ['Student Data Editor'],
    authzData: ctx.authz_data,
  });
  const byUid = new Map(rows.map((row) => [row.uid, row.enrollment]));
  return unique.map((uid) => ({ uid, enrollment: byUid.get(uid) ?? null }));
}

/** The students' enrollments, or an error naming the UIDs that have none. */
async function selectEnrolled(ctx: CourseInstanceActionContext, uids: string[]) {
  const found = await selectEnrollments(ctx, uids);
  const missing = found.filter(({ enrollment }) => enrollment === null).map(({ uid }) => uid);
  if (missing.length > 0) {
    throw new CourseActionError(
      `The course instance "${ctx.course_instance.short_name}" has no student with UID ${some(missing)}. Find students in the students dataset.`,
    );
  }
  return found.map(({ uid, enrollment }) => ({ uid, enrollment: enrollment! }));
}

/** Those whose status the action applies to, or an error when it applies to none of them. */
async function selectWithStatus(
  ctx: CourseInstanceActionContext,
  uids: string[],
  from: EnumEnrollmentStatus[],
) {
  const students = await selectEnrolled(ctx, uids);
  const changing = students.filter(({ enrollment }) => from.includes(enrollment.status));
  if (changing.length === 0) {
    throw new CourseActionError(
      `This applies to students who are ${from.join(' or ')}, and none of these is: ${some(
        students.map(({ uid, enrollment }) => `${uid} is ${enrollment.status}`),
      )}.`,
    );
  }
  return { students, changing };
}

function statusAction({
  description,
  effects,
  undo,
  from,
  title,
  done,
  apply,
}: {
  description: string;
  effects: string;
  undo: string | null;
  from: EnumEnrollmentStatus[];
  title: (students: string) => string;
  done: (students: string) => string;
  apply: (ctx: CourseInstanceActionContext, enrollment: Enrollment) => Promise<unknown>;
}) {
  return courseInstanceAction({
    group: 'students',
    description,
    effects,
    undo,
    permission: 'student_data_editor',
    input: StudentsInputSchema,
    describe: async ({ ctx, input }) => {
      const { students, changing } = await selectWithStatus(ctx, input.uids, from);
      const unchanged = students.length - changing.length;
      return {
        title: title(count(changing.length, 'student')),
        context: [
          ctx.course_instance.short_name,
          unchanged > 0 ? `${count(unchanged, 'other student')} left as is` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: changing.map(({ uid, enrollment }) => ({
          label: uid,
          detail: `Now: ${enrollment.status}`,
        })),
      };
    },
    run: async ({ ctx, input }) => {
      const { changing } = await selectWithStatus(ctx, input.uids, from);
      for (const { enrollment } of changing) await apply(ctx, enrollment);
      return { summary: done(count(changing.length, 'student')) };
    },
  });
}

/** What inviting each UID would do, given who it is and its enrollment so far. */
async function planInvitations(ctx: CourseInstanceActionContext, uids: string[]) {
  if (!ctx.course_instance.modern_publishing) {
    throw new CourseActionError(
      'This course instance uses the older access rules, under which students enroll themselves, so invitations are not available. Tell the instructor.',
    );
  }
  const found = await selectEnrollments(ctx, uids);
  const plan: { uid: string; invite: boolean; detail: string }[] = [];
  for (const { uid, enrollment } of found) {
    const user = await selectOptionalUserByUid(uid);
    const isStaff =
      user !== null &&
      (await callScalar(
        'users_is_instructor_in_course_instance',
        [user.id, ctx.course_instance.id],
        z.boolean(),
      ));
    if (isStaff) {
      plan.push({ uid, invite: false, detail: 'course staff' });
    } else if (enrollment === null) {
      plan.push({ uid, invite: true, detail: 'New' });
    } else if (enrollment.status === 'rejected' || enrollment.status === 'left') {
      plan.push({ uid, invite: true, detail: `Now: ${enrollment.status}` });
    } else {
      plan.push({ uid, invite: false, detail: `already ${enrollment.status}` });
    }
  }
  const inviting = plan.filter(({ invite }) => invite);
  if (inviting.length === 0) {
    throw new CourseActionError(
      `None of these can be invited: ${some(plan.map(({ uid, detail }) => `${uid} is ${detail}`))}. Re-enroll blocked or removed students with students_reenroll.`,
    );
  }
  return { plan, inviting };
}

const LabelInputSchema = z.strictObject({
  ...COURSE_INSTANCE_INPUT,
  label_name: z
    .string()
    .min(1)
    .describe(
      'Name of a student label in the course instance, from "studentLabels" in infoCourseInstance.json.',
    ),
  uids: UidsSchema,
});

async function selectLabel(ctx: CourseInstanceActionContext, name: string) {
  const labels = await selectStudentLabelsInCourseInstance(ctx.course_instance);
  const label = labels.find((candidate) => candidate.name === name);
  if (!label) {
    throw new CourseActionError(
      labels.length > 0
        ? `The course instance "${ctx.course_instance.short_name}" has no student label named "${name}". Its labels: ${labels.map((l) => l.name).join(', ')}.`
        : `The course instance "${ctx.course_instance.short_name}" has no student labels yet. Add one to "studentLabels" in infoCourseInstance.json and have the change saved first.`,
    );
  }
  return label;
}

function labelAction({
  description,
  effects,
  undo,
  title,
  done,
  apply,
}: {
  description: string;
  effects: string;
  undo: string;
  title: (label: string, students: string) => string;
  done: (label: string, students: string) => string;
  apply: typeof addLabelToEnrollments | typeof removeLabelFromEnrollments;
}) {
  return courseInstanceAction({
    group: 'students',
    description,
    effects,
    undo,
    permission: 'student_data_editor',
    input: LabelInputSchema,
    describe: async ({ ctx, input }) => {
      const label = await selectLabel(ctx, input.label_name);
      const students = await selectEnrolled(ctx, input.uids);
      return {
        title: title(label.name, count(students.length, 'student')),
        context: ctx.course_instance.short_name,
        rows: students.map(({ uid }) => ({ label: uid })),
      };
    },
    run: async ({ ctx, input }) => {
      const label = await selectLabel(ctx, input.label_name);
      const students = await selectEnrolled(ctx, input.uids);
      await apply({
        enrollments: students.map(({ enrollment }) => enrollment),
        label,
        authzData: ctx.authz_data,
      });
      return { summary: done(label.name, count(students.length, 'student')) };
    },
  });
}

const ExtensionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe(
    'A short name for the extension, unique in the course instance, such as "Makeup week".',
  );

function requireModernPublishing(ctx: CourseInstanceActionContext) {
  if (!ctx.course_instance.modern_publishing) {
    throw new CourseActionError(
      'This course instance uses the older access rules, which have no extensions. Tell the instructor.',
    );
  }
}

const ExtensionEndDateSchema = z.iso
  .datetime({ offset: true })
  .describe(
    "When the students' access now ends, as an ISO 8601 timestamp with an offset or Z. Work it out in the course instance's display_timezone.",
  );

const CreateExtensionInputSchema = z.strictObject({
  ...COURSE_INSTANCE_INPUT,
  name: ExtensionNameSchema,
  end_date: ExtensionEndDateSchema,
  uids: UidsSchema,
});

/** An extension's end date, which must be later than now and than when everyone's access ends. */
function parseExtensionEndDate(ctx: CourseInstanceActionContext, end_date: string) {
  const endDate = new Date(end_date);
  if (endDate.getTime() <= Date.now()) {
    throw new CourseActionError('The end date has already passed. Use a later one.');
  }
  const publishingEnd = ctx.course_instance.publishing_end_date;
  if (publishingEnd && endDate.getTime() <= publishingEnd.getTime()) {
    throw new CourseActionError(
      `The course instance is already open to everyone until ${formatDate(publishingEnd, ctx.course_instance.display_timezone)}, so an extension must end later than that.`,
    );
  }
  return endDate;
}

async function planExtension(
  ctx: CourseInstanceActionContext,
  input: z.infer<typeof CreateExtensionInputSchema>,
) {
  requireModernPublishing(ctx);
  const endDate = parseExtensionEndDate(ctx, input.end_date);
  if (
    await selectPublishingExtensionByName({ name: input.name, courseInstance: ctx.course_instance })
  ) {
    throw new CourseActionError(
      `The course instance already has an extension named "${input.name}". Use another name.`,
    );
  }
  return { endDate, students: await selectEnrolled(ctx, input.uids) };
}

const DeleteExtensionInputSchema = z.strictObject({
  ...COURSE_INSTANCE_INPUT,
  name: z.string().min(1).describe('Name of the extension to remove.'),
});

async function selectExtension(ctx: CourseInstanceActionContext, name: string) {
  requireModernPublishing(ctx);
  const extension = await selectPublishingExtensionByName({
    name,
    courseInstance: ctx.course_instance,
  });
  if (!extension) {
    throw new CourseActionError(
      `The course instance "${ctx.course_instance.short_name}" has no extension named "${name}".`,
    );
  }
  return extension;
}

const UpdateExtensionInputSchema = z.strictObject({
  ...COURSE_INSTANCE_INPUT,
  name: z.string().min(1).describe('Name of the extension to change.'),
  new_name: ExtensionNameSchema.optional().describe('A new name for the extension.'),
  end_date: ExtensionEndDateSchema.optional(),
  add_uids: UidsSchema.optional().describe('UIDs of students to add to the extension.'),
  remove_uids: UidsSchema.optional().describe('UIDs of students to take out of the extension.'),
});

async function planExtensionUpdate(
  ctx: CourseInstanceActionContext,
  input: z.infer<typeof UpdateExtensionInputSchema>,
) {
  const extension = await selectExtension(ctx, input.name);
  if (
    input.new_name === undefined &&
    input.end_date === undefined &&
    input.add_uids === undefined &&
    input.remove_uids === undefined
  ) {
    throw new CourseActionError('Give new_name, end_date, add_uids, or remove_uids.');
  }
  if (
    input.new_name !== undefined &&
    input.new_name !== extension.name &&
    (await selectPublishingExtensionByName({
      name: input.new_name,
      courseInstance: ctx.course_instance,
    }))
  ) {
    throw new CourseActionError(
      `The course instance already has an extension named "${input.new_name}". Use another name.`,
    );
  }
  const endDate = input.end_date === undefined ? null : parseExtensionEndDate(ctx, input.end_date);
  const current = new Set(
    (await selectEnrollmentsForPublishingExtension({ extension })).map(({ id }) => id),
  );
  const add = (await selectEnrolled(ctx, input.add_uids ?? [])).filter(
    ({ enrollment }) => !current.has(enrollment.id),
  );
  const remove = await selectEnrolled(ctx, input.remove_uids ?? []);
  const notIn = remove.filter(({ enrollment }) => !current.has(enrollment.id));
  if (notIn.length > 0) {
    throw new CourseActionError(
      `Not in the extension "${input.name}": ${some(notIn.map(({ uid }) => uid))}. Find its students in the publishing_extension_students dataset.`,
    );
  }
  if (current.size + add.length - remove.length === 0) {
    throw new CourseActionError(
      `This would leave the extension "${input.name}" with no students. Remove it with publishing_extensions_delete instead.`,
    );
  }
  return { extension, endDate, add, remove };
}

export const studentActions = {
  students_invite: courseInstanceAction({
    group: 'students',
    description:
      'Invite people to the course instance by UID. Each gets an invitation they accept the next time they open PrairieLearn. People who are already enrolled, invited, or course staff are skipped.',
    effects:
      'Each invited person sees the invitation on their PrairieLearn home page and joins by accepting it.',
    undo: 'Cancel the invitations with students_cancel_invitation, until they are accepted.',
    permission: 'student_data_editor',
    input: StudentsInputSchema,
    describe: async ({ ctx, input }) => {
      const { plan, inviting } = await planInvitations(ctx, input.uids);
      const skipped = plan.length - inviting.length;
      return {
        title: `Invite ${count(inviting.length, 'student')}`,
        context: [
          ctx.course_instance.short_name,
          skipped > 0 ? `${count(skipped, 'other')} skipped` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        rows: inviting.map(({ uid, detail }) => ({ label: uid, detail })),
      };
    },
    run: async ({ ctx, input }) => {
      const { inviting } = await planInvitations(ctx, input.uids);
      for (const { uid } of inviting) {
        await inviteStudentByUid({
          uid,
          requiredRole: ['Student Data Editor'],
          authzData: ctx.authz_data,
          courseInstance: ctx.course_instance,
        });
      }
      return { summary: `Invited ${count(inviting.length, 'student')}.` };
    },
  }),
  students_cancel_invitation: statusAction({
    description:
      'Cancel invitations that have not been accepted, such as ones sent to the wrong person.',
    effects:
      'The invitation disappears from the person’s home page, and they are no longer listed.',
    undo: 'Invite them again with students_invite.',
    from: ['invited', 'rejected'],
    title: (students) => `Cancel the invitation of ${students}`,
    done: (students) => `Cancelled the invitation of ${students}.`,
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
      'Block enrolled students from the course instance. Their work and scores are kept, and they cannot rejoin on their own.',
    effects: 'The students can no longer open the course instance or its assessments.',
    undo: 'Let them back in with students_reenroll.',
    from: ['joined'],
    title: (students) => `Block ${students}`,
    done: (students) => `Blocked ${students}.`,
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'blocked',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_remove: statusAction({
    description:
      'Remove enrolled students from the course instance, such as ones who dropped. Their work and scores are kept. Use students_block instead to keep someone out for cause.',
    effects:
      'The students no longer see the course instance and are left out of the gradebook and statistics.',
    undo: 'Bring them back with students_reenroll.',
    from: ['joined'],
    title: (students) => `Remove ${students}`,
    done: (students) => `Removed ${students}.`,
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'removed',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  students_reenroll: statusAction({
    description: 'Bring blocked or removed students back into the course instance.',
    effects: 'The students can open the course instance again, with their earlier work and scores.',
    undo: 'Block them with students_block or remove them with students_remove.',
    from: ['blocked', 'removed'],
    title: (students) => `Re-enroll ${students}`,
    done: (students) => `Re-enrolled ${students}.`,
    apply: (ctx, enrollment) =>
      setEnrollmentStatus({
        enrollment,
        status: 'joined',
        authzData: ctx.authz_data,
        requiredRole: ['Student Data Editor'],
      }),
  }),
  student_labels_add_students: labelAction({
    description:
      'Put students in a student label, which groups them for things like access rules that apply only to them. The label must already exist; define new ones in the course files.',
    effects:
      'Anything set up for that label, such as different assessment dates, now applies to these students.',
    undo: 'Take them out again with student_labels_remove_students.',
    title: (label, students) => `Add the label "${label}" to ${students}`,
    done: (label, students) => `Added the label "${label}" to ${students}.`,
    apply: addLabelToEnrollments,
  }),
  student_labels_remove_students: labelAction({
    description: 'Take students out of a student label.',
    effects: 'What was set up for that label no longer applies to these students.',
    undo: 'Put them back with student_labels_add_students.',
    title: (label, students) => `Remove the label "${label}" from ${students}`,
    done: (label, students) => `Removed the label "${label}" from ${students}.`,
    apply: removeLabelFromEnrollments,
  }),
  publishing_extensions_create: courseInstanceAction({
    group: 'students',
    description:
      'Give some students access to the course instance after it closes for everyone else, such as to finish work late. To change when the course instance closes for everyone, edit its publishing dates in the course files instead.',
    effects:
      'These students keep access to the course instance until the new date. Each assessment still follows its own dates.',
    undo: 'Remove the extension with publishing_extensions_delete.',
    permission: ['course_editor', 'student_data_editor'],
    input: CreateExtensionInputSchema,
    describe: async ({ ctx, input }) => {
      const { endDate, students } = await planExtension(ctx, input);
      return {
        title: `Extend access for ${count(students.length, 'student')} until ${formatDate(endDate, ctx.course_instance.display_timezone)}`,
        context: `${ctx.course_instance.short_name} · Extension "${input.name}"`,
        rows: students.map(({ uid }) => ({ label: uid })),
      };
    },
    run: async ({ ctx, input }) => {
      const { endDate, students } = await planExtension(ctx, input);
      await createPublishingExtensionWithEnrollments({
        courseInstance: ctx.course_instance,
        name: input.name,
        endDate,
        enrollments: students.map(({ enrollment }) => enrollment),
      });
      return {
        summary: `Created the extension "${input.name}" for ${count(students.length, 'student')}.`,
      };
    },
  }),
  publishing_extensions_update: courseInstanceAction({
    group: 'students',
    description:
      'Change an extension: when it ends, its name, or which students it covers. Use this instead of creating a second extension for the same students.',
    effects:
      'Students added keep access to the course instance until the extension ends. Students taken out lose access when everyone else does.',
    undo: 'Change the extension back the same way. The request shows how it is now.',
    permission: ['course_editor', 'student_data_editor'],
    input: UpdateExtensionInputSchema,
    describe: async ({ ctx, input }) => {
      const { extension, endDate, add, remove } = await planExtensionUpdate(ctx, input);
      const timezone = ctx.course_instance.display_timezone;
      return {
        title: `Change the extension "${input.name}"`,
        context: ctx.course_instance.short_name,
        rows: [
          ...(input.new_name === undefined
            ? []
            : [{ label: 'Name', detail: `"${input.name}" becomes "${input.new_name}"` }]),
          ...(endDate === null
            ? []
            : [
                {
                  label: 'Extended access until',
                  detail: `${formatDate(endDate, timezone)}, which is now ${formatDate(extension.end_date, timezone)}`,
                },
              ]),
          ...add.map(({ uid }) => ({ label: uid, detail: 'Add' })),
          ...remove.map(({ uid }) => ({ label: uid, detail: 'Take out' })),
        ],
      };
    },
    run: async ({ ctx, input }) => {
      const { extension, endDate, add, remove } = await planExtensionUpdate(ctx, input);
      await runInTransactionAsync(async () => {
        await updatePublishingExtension({
          extension,
          name: input.new_name ?? extension.name,
          endDate: endDate ?? extension.end_date,
        });
        await updatePublishingExtensionEnrollments({
          courseInstancePublishingExtension: extension,
          enrollmentsToAdd: add.map(({ enrollment }) => enrollment),
          enrollmentsToRemove: remove.map(({ enrollment }) => enrollment),
        });
      });
      return { summary: `Changed the extension "${input.new_name ?? input.name}".` };
    },
  }),
  publishing_extensions_delete: courseInstanceAction({
    group: 'students',
    description: 'Remove an extension, so its students lose access when everyone else does.',
    effects:
      'The students in the extension lose access to the course instance at its usual closing date, or at once if that has passed.',
    undo: 'Create the extension again with publishing_extensions_create.',
    permission: ['course_editor', 'student_data_editor'],
    input: DeleteExtensionInputSchema,
    describe: async ({ ctx, input }) => {
      const extension = await selectExtension(ctx, input.name);
      return {
        title: `Remove the extension "${input.name}"`,
        context: ctx.course_instance.short_name,
        rows: [
          {
            label: 'Extended access until',
            detail: formatDate(extension.end_date, ctx.course_instance.display_timezone),
          },
        ],
      };
    },
    run: async ({ ctx, input }) => {
      const extension = await selectExtension(ctx, input.name);
      await deletePublishingExtension({ extension, courseInstance: ctx.course_instance });
      return { summary: `Removed the extension "${input.name}".` };
    },
  }),
};
