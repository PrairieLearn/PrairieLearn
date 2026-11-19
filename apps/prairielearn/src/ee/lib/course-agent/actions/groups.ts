import { z } from 'zod';

import { runInTransactionAsync } from '@prairielearn/postgres';

import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  leaveGroup,
  selectUserInCourseInstance,
} from '../../../../lib/groups.js';
import {
  type GroupUsersRow,
  selectGroupConfigForAssessment,
  selectGroupsForConfig,
} from '../../../../models/group.js';

import {
  ASSESSMENT_INPUT,
  type AssessmentActionContext,
  CourseActionError,
  assessmentAction,
  count,
} from './action.js';

const MemberUidsSchema = z.array(z.email().max(256)).max(50);

const some = (items: string[]) =>
  `${items.slice(0, 20).join(', ')}${items.length > 20 ? ', …' : ''}`;

const where = (ctx: AssessmentActionContext) =>
  `${ctx.assessment.title ?? ctx.assessment.tid} · ${ctx.course_instance.short_name}`;

/** The assessment's groups, or an error when it does not use group work. */
async function selectGroups(ctx: AssessmentActionContext) {
  const config = await selectGroupConfigForAssessment(ctx.assessment.id);
  if (!config) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" does not use group work. Turn it on in the assessment's infoAssessment.json first.`,
    );
  }
  return await selectGroupsForConfig(config.id);
}

/** Refuses anyone who cannot join a group: people outside the course instance, and members of another group. */
async function checkCanJoin(ctx: AssessmentActionContext, groups: GroupUsersRow[], uids: string[]) {
  const groupByUid = new Map(
    groups.flatMap((group) => group.users.map(({ uid }) => [uid, group.name] as const)),
  );
  const taken = uids.filter((uid) => groupByUid.has(uid));
  if (taken.length > 0) {
    throw new CourseActionError(
      `Already in a group for this assessment: ${some(taken.map((uid) => `${uid} is in ${groupByUid.get(uid)}`))}. Take them out of that group first with groups_set_members.`,
    );
  }
  const users = await Promise.all(
    uids.map((uid) =>
      selectUserInCourseInstance({
        uid,
        courseInstance: ctx.course_instance,
        authzData: ctx.authz_data,
      }),
    ),
  );
  const missing = uids.filter((_, index) => users[index] === null);
  if (missing.length > 0) {
    throw new CourseActionError(
      `Not enrolled in the course instance "${ctx.course_instance.short_name}": ${some(missing)}. Find students in the students dataset.`,
    );
  }
}

/** The group library's refusals are written for staff, so the agent can pass them on. */
async function refusingAsCourseAction<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GroupOperationError) throw new CourseActionError(error.message);
    throw error;
  }
}

const CreateGroupInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  name: z
    .string()
    .regex(/^[0-9a-zA-Z]{1,30}$/)
    .optional()
    .describe(
      'A name for the group, of up to 30 letters and digits. Leave it out for PrairieLearn to name the group.',
    ),
  uids: MemberUidsSchema.min(1).describe(
    'UIDs of the students to put in the group, from the uid column of the students dataset.',
  ),
});

async function planCreateGroup(
  ctx: AssessmentActionContext,
  input: z.infer<typeof CreateGroupInputSchema>,
) {
  const groups = await selectGroups(ctx);
  if (input.name && groups.some((group) => group.name === input.name)) {
    throw new CourseActionError(
      `This assessment already has a group named "${input.name}". Use another name, or change its members with groups_set_members.`,
    );
  }
  const uids = [...new Set(input.uids)];
  await checkCanJoin(ctx, groups, uids);
  return uids;
}

const SetMembersInputSchema = z.strictObject({
  ...ASSESSMENT_INPUT,
  group_name: z
    .string()
    .min(1)
    .describe('Name of the group, from the group_name column of the group_members dataset.'),
  add_uids: MemberUidsSchema.optional().describe('UIDs of students to add to the group.'),
  remove_uids: MemberUidsSchema.optional().describe('UIDs of students to take out of the group.'),
});

async function planSetMembers(
  ctx: AssessmentActionContext,
  input: z.infer<typeof SetMembersInputSchema>,
) {
  const add = [...new Set(input.add_uids ?? [])];
  const removeUids = [...new Set(input.remove_uids ?? [])];
  if (add.length === 0 && removeUids.length === 0) {
    throw new CourseActionError('Give add_uids, remove_uids, or both.');
  }
  const groups = await selectGroups(ctx);
  const group = groups.find(({ name }) => name === input.group_name);
  if (!group) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no group named "${input.group_name}". Find groups in the group_members dataset, or create one with groups_create.`,
    );
  }
  const members = new Map(group.users.map((user) => [user.uid, user]));
  const notMembers = removeUids.filter((uid) => !members.has(uid));
  if (notMembers.length > 0) {
    throw new CourseActionError(
      `Not in the group "${group.name}": ${some(notMembers)}. Its members are ${some([...members.keys()]) || 'no one'}.`,
    );
  }
  if (removeUids.length === members.size && add.length === 0) {
    throw new CourseActionError(
      `This would leave the group "${group.name}" with no one in it. Tell the instructor they can delete the group on the assessment's Groups page instead.`,
    );
  }
  await checkCanJoin(ctx, groups, add);
  return { group, add, remove: removeUids.map((uid) => members.get(uid)!) };
}

export const groupActions = {
  groups_create: assessmentAction({
    group: 'group_members',
    description:
      'Create a group of students for an assessment that uses group work. To put every student in a group at once, tell the instructor to use the Groups page of the assessment, which can make random groups or read them from a file.',
    effects:
      'The students in the group share one attempt at the assessment and see each other as group members.',
    undo: "Delete the group on the assessment's Groups page.",
    permission: 'student_data_editor',
    input: CreateGroupInputSchema,
    describe: async ({ ctx, input }) => {
      const uids = await planCreateGroup(ctx, input);
      return {
        title: input.name
          ? `Create the group "${input.name}" with ${count(uids.length, 'student')}`
          : `Create a group of ${count(uids.length, 'student')}`,
        context: where(ctx),
        rows: uids.map((uid) => ({ label: uid })),
      };
    },
    run: async ({ ctx, input }) => {
      const uids = await planCreateGroup(ctx, input);
      const group = await refusingAsCourseAction(() =>
        createGroup({
          course_instance: ctx.course_instance,
          assessment: ctx.assessment,
          group_name: input.name ?? null,
          uids,
          authn_user_id: ctx.user.id,
          authzData: ctx.authz_data,
        }),
      );
      return {
        summary: `Created the group "${group.name}" with ${count(uids.length, 'student')}.`,
      };
    },
  }),
  groups_set_members: assessmentAction({
    group: 'group_members',
    description:
      'Add students to a group or take them out of it, such as when a student switches groups. To move a student between groups, take them out of one group and add them to the other in two requests.',
    effects:
      "A student added to the group shares its attempt from then on. A student taken out can no longer open the group's attempt and needs a group again to work on the assessment.",
    undo: 'Change the members back the same way.',
    permission: 'student_data_editor',
    input: SetMembersInputSchema,
    describe: async ({ ctx, input }) => {
      const { group, add, remove } = await planSetMembers(ctx, input);
      return {
        title: `Change who is in the group "${group.name}"`,
        context: where(ctx),
        rows: [
          ...add.map((uid) => ({ label: uid, detail: 'Add' })),
          ...remove.map(({ uid }) => ({ label: uid, detail: 'Take out' })),
        ],
      };
    },
    run: async ({ ctx, input }) => {
      const { group, add, remove } = await planSetMembers(ctx, input);
      await refusingAsCourseAction(() =>
        runInTransactionAsync(async () => {
          for (const user of remove) {
            await leaveGroup(ctx.assessment.id, user.id, ctx.user.id, group.group_id);
          }
          for (const uid of add) {
            await addUserToGroup({
              course_instance: ctx.course_instance,
              assessment: ctx.assessment,
              group_id: group.group_id,
              uid,
              authn_user_id: ctx.user.id,
              enforceGroupSize: false,
              authzData: ctx.authz_data,
            });
          }
        }),
      );
      const changes = [
        add.length > 0 ? `added ${count(add.length, 'student')}` : null,
        remove.length > 0 ? `took out ${count(remove.length, 'student')}` : null,
      ].filter(Boolean);
      return { summary: `Changed the group "${group.name}": ${changes.join(' and ')}.` };
    },
  }),
};
