import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { IdSchema } from '@prairielearn/zod';

import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  leaveGroup,
} from '../../../../lib/groups.js';
import { idsEqual } from '../../../../lib/id.js';
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

/** The Groups page takes at most 50 UIDs at a time. */
const UidsSchema = z
  .array(
    z
      .string()
      .regex(/^[^\s,;]+$/, 'A UID has no spaces, commas, or semicolons.')
      .max(256),
  )
  .min(1)
  .max(50)
  .describe(
    'UIDs of the students, such as name@example.edu, as the instructor gave them. Course data has no UIDs, so ask the instructor for them.',
  );

const GroupInput = {
  team_id: IdSchema.optional().describe(
    'The group, from the team_id column of the group_members dataset. Give this or group_name.',
  ),
  group_name: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Name of the group, from the group_name column of the group_members dataset. Give this or team_id.',
    ),
};

const some = (items: string[]) =>
  `${items.slice(0, 20).join(', ')}${items.length > 20 ? ', …' : ''}`;

/** The assessment's groups. The Groups page offers no group changes until group work is on. */
async function selectGroups(ctx: AssessmentActionContext) {
  const groupConfig = await selectGroupConfigForAssessment(ctx.assessment.id);
  if (!groupConfig) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" does not use group work. Turn it on with "groups" in its infoAssessment.json first.`,
    );
  }
  return await selectGroupsForConfig(groupConfig.id);
}

function findGroup(
  ctx: AssessmentActionContext,
  groups: GroupUsersRow[],
  { team_id, group_name }: { team_id?: string; group_name?: string },
) {
  if ((team_id == null) === (group_name == null)) {
    throw new CourseActionError('Give exactly one of team_id and group_name.');
  }
  const group = groups.find((group) =>
    team_id != null ? idsEqual(group.group_id, team_id) : group.name === group_name,
  );
  if (!group) {
    throw new CourseActionError(
      `The assessment "${ctx.assessment.tid}" has no group ${team_id != null ? `with team_id ${team_id}` : `named "${group_name}"`}. Find groups in the group_members dataset.`,
    );
  }
  return group;
}

/**
 * Refuses students who are already in a group for the assessment. The group library refuses them
 * too, but without saying who or which group, which the course agent needs to correct the request.
 */
function refuseGrouped(groups: GroupUsersRow[], uids: string[]) {
  const groupByUid = new Map(
    groups.flatMap((group) => group.users.map(({ uid }) => [uid, group.name] as const)),
  );
  const grouped = uids.filter((uid) => groupByUid.has(uid));
  if (grouped.length > 0) {
    throw new CourseActionError(
      `Already in a group for this assessment: ${some(grouped.map((uid) => `${uid} is in ${groupByUid.get(uid)}`))}. Remove them from that group first with groups_remove_members.`,
    );
  }
}

export const groupActions = {
  groups_create: assessmentAction({
    description:
      "Create a group of students for an assessment that uses group work, as on the assessment's Groups page. The students in a group share one attempt at the assessment.",
    requiredRole: ['Student Data Editor'],
    input: z.strictObject({
      ...ASSESSMENT_INPUT,
      group_name: z
        .string()
        .max(30)
        .optional()
        .describe(
          'A name for the group, of up to 30 letters and digits. Leave it out for PrairieLearn to name the group.',
        ),
      uids: UidsSchema,
    }),
    run: async ({ ctx, input }) => {
      const uids = [...new Set(input.uids)];
      refuseGrouped(await selectGroups(ctx), uids);
      try {
        const group = await createGroup({
          course_instance: ctx.course_instance,
          assessment: ctx.assessment,
          group_name: input.group_name || null,
          uids,
          authn_user_id: ctx.user.id,
          authzData: ctx.authz_data,
        });
        return {
          summary: `Created the group "${group.name}" with ${count(uids.length, 'student')}.`,
        };
      } catch (err) {
        if (err instanceof GroupOperationError) throw new CourseActionError(err.message);
        throw err;
      }
    },
  }),
  groups_add_members: assessmentAction({
    description:
      "Add students to an existing group, as editing a group on the assessment's Groups page does. As on that page, the group's size limit does not apply. To move a student between groups, remove them from their group with groups_remove_members first.",
    requiredRole: ['Student Data Editor'],
    input: z.strictObject({ ...ASSESSMENT_INPUT, ...GroupInput, uids: UidsSchema }),
    run: async ({ ctx, input }) => {
      const groups = await selectGroups(ctx);
      const group = findGroup(ctx, groups, input);
      const uids = [...new Set(input.uids)];
      refuseGrouped(groups, uids);
      const failures: string[] = [];
      for (const uid of uids) {
        try {
          await addUserToGroup({
            course_instance: ctx.course_instance,
            assessment: ctx.assessment,
            group_id: group.group_id,
            uid,
            authn_user_id: ctx.user.id,
            enforceGroupSize: false,
            authzData: ctx.authz_data,
          });
        } catch (err) {
          if (!(err instanceof GroupOperationError)) throw err;
          failures.push(err.message);
        }
      }
      // The page reports each failure and keeps the rest; an action changes all or nothing.
      if (failures.length > 0) {
        throw new CourseActionError(`No one was added. ${failures.join(' ')}`);
      }
      return {
        summary: `Added ${count(uids.length, 'student')} to the group "${group.name}".`,
      };
    },
  }),
  groups_remove_members: assessmentAction({
    description:
      "Remove students from a group, as editing a group on the assessment's Groups page does. A student removed from a group can no longer open the group's attempt.",
    requiredRole: ['Student Data Editor'],
    input: z.strictObject({ ...ASSESSMENT_INPUT, ...GroupInput, uids: UidsSchema }),
    run: async ({ ctx, input }) => {
      const group = findGroup(ctx, await selectGroups(ctx), input);
      const members = new Map(group.users.map((user) => [user.uid, user]));
      const uids = [...new Set(input.uids)];
      const notMembers = uids.filter((uid) => !members.has(uid));
      if (notMembers.length > 0) {
        throw new CourseActionError(
          `Not in the group "${group.name}": ${some(notMembers)}. No one was removed.`,
        );
      }
      for (const uid of uids) {
        try {
          await leaveGroup(ctx.assessment.id, members.get(uid)!.id, ctx.user.id, group.group_id);
        } catch (err) {
          if (err instanceof GroupOperationError || err instanceof HttpStatusError) {
            throw new CourseActionError(`No one was removed. ${uid}: ${err.message}`);
          }
          throw err;
        }
      }
      return {
        summary: `Removed ${count(uids.length, 'student')} from the group "${group.name}", which now has ${count(members.size - uids.length, 'member')}.`,
      };
    },
  }),
};
