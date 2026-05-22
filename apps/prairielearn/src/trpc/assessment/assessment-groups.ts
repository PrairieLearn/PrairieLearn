import * as path from 'path';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { StaffGroupConfigSchema } from '../../lib/client/safe-db-types.js';
import { saveJsonFile } from '../../lib/editors.js';
import {
  cascadeRoleRenamesToZones,
  normalizeGroupSettings,
  serializeGroupSettings,
  stripLegacyGroupKeys,
} from '../../lib/group-config.js';
import { randomGroups } from '../../lib/group-update.js';
import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  deleteAllGroups,
  deleteGroup,
  leaveGroup,
} from '../../lib/groups.js';
import { parseUniqueValuesFromString } from '../../lib/string-util.js';
import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import {
  selectGroupById,
  selectGroupConfigForAssessment,
  selectGroupsForConfig,
  selectNotAssignedForAssessment,
  selectUidsNotInGroup,
} from '../../models/group.js';
import type { AssessmentJsonInput } from '../../schemas/infoAssessment.js';
import { throwAppError } from '../app-errors.js';

import {
  type createContext,
  requireCourseInstancePermissionEdit,
  requireCourseInstancePermissionView,
  requireCoursePermissionEdit,
  t,
} from './init.js';

type AssessmentTrpcCtx = ReturnType<typeof createContext>;

const MAX_UIDS = 50;

export interface AssessmentGroupsError {
  AddGroup: never;
  EditGroup: never;
  DeleteGroup: never;
  DeleteAll: never;
  EnableGroupWork: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  DisableGroupWork: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  UpdateGroupConfig: { code: 'SYNC_JOB_FAILED'; jobSequenceId: string };
  RandomizeGroups: never;
  Membership: never;
  RefreshGroups: never;
}

const addGroup = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      groupName: z.string(),
      uids: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { course_instance, assessment, authn_user, authz_data } = ctx;

    let createdGroupId: string;
    try {
      const group = await createGroup({
        course_instance,
        assessment,
        group_name: input.groupName || null,
        uids: parseUniqueValuesFromString(input.uids, MAX_UIDS),
        authn_user_id: authn_user.id,
        authzData: authz_data,
      });
      createdGroupId = group.id;
    } catch (err) {
      if (err instanceof GroupOperationError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      throw err;
    }

    const [group, notAssigned] = await Promise.all([
      selectGroupById({ group_id: createdGroupId, assessment_id: assessment.id }),
      selectNotAssignedForAssessment({
        assessment_id: assessment.id,
        course_instance_id: course_instance.id,
      }),
    ]);
    return { group, notAssigned };
  });

const editGroup = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      groupId: IdSchema,
      uids: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { course_instance, assessment, authn_user, authz_data } = ctx;

    const desiredUids = parseUniqueValuesFromString(input.uids, MAX_UIDS);

    const currentGroup = await selectGroupById({
      group_id: input.groupId,
      assessment_id: assessment.id,
    });
    const desiredSet = new Set(desiredUids);
    const currentSet = new Set(currentGroup.users.map((u) => u.uid));
    const toAdd = desiredUids.filter((uid) => !currentSet.has(uid));
    const toRemove = currentGroup.users.filter((u) => !desiredSet.has(u.uid));

    const failures: { uid: string; message: string }[] = [];

    await runInTransactionAsync(async () => {
      for (const user of toRemove) {
        try {
          await leaveGroup(assessment.id, user.id, authn_user.id, input.groupId);
        } catch (err) {
          if (err instanceof GroupOperationError || err instanceof HttpStatusError) {
            failures.push({ uid: user.uid, message: err.message });
          } else {
            throw err;
          }
        }
      }

      for (const uid of toAdd) {
        try {
          await addUserToGroup({
            course_instance,
            assessment,
            group_id: input.groupId,
            uid,
            authn_user_id: authn_user.id,
            enforceGroupSize: false,
            authzData: authz_data,
          });
        } catch (err) {
          if (err instanceof GroupOperationError) {
            failures.push({ uid, message: err.message });
          } else {
            throw err;
          }
        }
      }
    });

    const [group, notAssigned] = await Promise.all([
      selectGroupById({ group_id: input.groupId, assessment_id: assessment.id }),
      selectNotAssignedForAssessment({
        assessment_id: assessment.id,
        course_instance_id: course_instance.id,
      }),
    ]);
    return { group, notAssigned, failures };
  });

const deleteGroupProcedure = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      groupId: IdSchema,
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { assessment, authn_user, course_instance } = ctx;

    try {
      await deleteGroup(assessment.id, input.groupId, authn_user.id);
    } catch (err) {
      if (err instanceof GroupOperationError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: err.message });
      }
      throw err;
    }

    const notAssigned = await selectNotAssignedForAssessment({
      assessment_id: assessment.id,
      course_instance_id: course_instance.id,
    });
    return { notAssigned };
  });

const deleteAll = t.procedure.use(requireCourseInstancePermissionEdit).mutation(async ({ ctx }) => {
  const { assessment, authn_user, course_instance } = ctx;

  await deleteAllGroups(assessment.id, authn_user.id);

  const notAssigned = await selectNotAssignedForAssessment({
    assessment_id: assessment.id,
    course_instance_id: course_instance.id,
  });
  return { notAssigned };
});

interface SyncJobFailedError {
  code: 'SYNC_JOB_FAILED';
  jobSequenceId: string;
}

/**
 * Saves the `groups` block of an assessment's `infoAssessment.json`. Centralizes
 * the boilerplate shared by `enableGroupWork` / `disableGroupWork` /
 * `updateGroupConfig`: assessment dir/path construction, the `saveJsonFile`
 * args, and conflict / sync-failed error mapping.
 */
async function saveAssessmentGroupsBlock({
  ctx,
  origHash,
  applyChanges,
  syncFailedMessage,
  noInstancesMessage,
}: {
  ctx: AssessmentTrpcCtx;
  origHash: string | null;
  applyChanges: (json: AssessmentJsonInput) => AssessmentJsonInput;
  syncFailedMessage: string;
  /**
   * If provided, the save is rejected with this message when the assessment
   * already has instances. Omit for the update-config path, which is allowed
   * to write while instances exist.
   */
  noInstancesMessage?: string;
}): Promise<{ newHash: string; jsonData: AssessmentJsonInput }> {
  if (noInstancesMessage && (await selectAssessmentHasInstances(ctx.assessment.id))) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: noInstancesMessage });
  }

  const assessmentDir = path.join(
    ctx.course.path,
    'courseInstances',
    ctx.course_instance.short_name,
    'assessments',
    ctx.assessment.tid!,
  );
  const assessmentPath = path.join(assessmentDir, 'infoAssessment.json');

  const saveResult = await saveJsonFile<AssessmentJsonInput>({
    applyChanges,
    jsonPath: assessmentPath,
    conflictCheck: {
      origHash,
      scope: (json) => json.groups ?? {},
    },
    locals: {
      authz_data: ctx.authz_data,
      course: ctx.course,
      user: ctx.authn_user,
    },
    container: {
      rootPath: assessmentDir,
      invalidRootPaths: [],
    },
  });

  if (!saveResult.success) {
    if (saveResult.reason === 'conflict') {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'The group configuration has been modified since you loaded this page. Please refresh and try again.',
      });
    }
    throwAppError<SyncJobFailedError>({
      code: 'SYNC_JOB_FAILED',
      message: syncFailedMessage,
      jobSequenceId: saveResult.jobSequenceId,
    });
  }

  return { newHash: saveResult.newHash, jsonData: saveResult.jsonData };
}

const enableGroupWork = t.procedure
  .use(requireCoursePermissionEdit)
  .input(z.object({ origHash: z.string().nullable() }))
  .mutation(async ({ input, ctx }) => {
    const { newHash, jsonData } = await saveAssessmentGroupsBlock({
      ctx,
      origHash: input.origHash,
      applyChanges: (json) => {
        json.groups = json.groups ?? {};
        return stripLegacyGroupKeys(json);
      },
      syncFailedMessage: 'Failed to enable group work.',
      noInstancesMessage:
        'Cannot enable group work while students have assessment instances. Remove their progress from the Students tab first.',
    });

    const groupConfig = await selectGroupConfigForAssessment(ctx.assessment.id);
    if (!groupConfig) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Group configuration was not created after enabling group work.',
      });
    }

    const [groups, notAssigned] = ctx.authz_data.has_course_instance_permission_view
      ? await Promise.all([
          selectGroupsForConfig(groupConfig.id),
          selectUidsNotInGroup({
            group_config_id: groupConfig.id,
            course_instance_id: groupConfig.course_instance_id,
          }),
        ])
      : [undefined, undefined];

    return {
      origHash: newHash,
      groupConfig: StaffGroupConfigSchema.parse(groupConfig),
      groupSettingsDefaults: normalizeGroupSettings(jsonData),
      groups,
      notAssigned,
    };
  });

const updateGroupConfig = t.procedure
  .use(requireCoursePermissionEdit)
  .input(
    z.object({
      origHash: z.string().nullable(),
      canCreateGroup: z.boolean(),
      canJoinGroup: z.boolean(),
      canLeaveGroup: z.boolean(),
      canNameGroup: z.boolean(),
      minMembers: z.number().nullable(),
      maxMembers: z.number().nullable(),
      roles: z.array(
        z.object({
          name: z.string(),
          origName: z.string().nullable(),
          minAssignees: z.number().nullable(),
          maxAssignees: z.number().nullable(),
          canAssignRoles: z.boolean(),
          canView: z.boolean(),
          canSubmit: z.boolean(),
        }),
      ),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const existingGroupConfig = await selectGroupConfigForAssessment(ctx.assessment.id);
    if (!existingGroupConfig) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Group work must be enabled before updating the group configuration.',
      });
    }

    if (
      input.minMembers != null &&
      input.maxMembers != null &&
      input.minMembers > input.maxMembers
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Minimum members cannot be greater than maximum members.',
      });
    }

    const roles = input.roles.map((r) => ({
      ...r,
      name: r.name.trim(),
      origName: r.origName?.trim() ?? null,
    }));
    const roleNames = roles.map((r) => r.name);
    if (roleNames.includes('')) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'All roles must have a name.',
      });
    }
    if (new Set(roleNames).size !== roleNames.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Role names must be unique.',
      });
    }
    for (const role of roles) {
      if (
        role.minAssignees != null &&
        role.maxAssignees != null &&
        role.minAssignees > role.maxAssignees
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Role "${role.name}": minimum assignees cannot be greater than maximum assignees.`,
        });
      }
    }

    const { newHash } = await saveAssessmentGroupsBlock({
      ctx,
      origHash: input.origHash,
      applyChanges: (json) => {
        cascadeRoleRenamesToZones(json, roles);
        json.groups = serializeGroupSettings({
          studentPermissions: {
            canCreateGroup: input.canCreateGroup,
            canJoinGroup: input.canJoinGroup,
            canLeaveGroup: input.canLeaveGroup,
            canNameGroup: input.canNameGroup,
          },
          minMembers: input.minMembers,
          maxMembers: input.maxMembers,
          roles,
        });
        return stripLegacyGroupKeys(json);
      },
      syncFailedMessage: 'Failed to update group configuration.',
    });

    return { origHash: newHash };
  });

const disableGroupWork = t.procedure
  .use(requireCoursePermissionEdit)
  .use(requireCourseInstancePermissionEdit)
  .input(z.object({ origHash: z.string().nullable() }))
  .mutation(async ({ input, ctx }) => {
    if (await selectAssessmentHasInstances(ctx.assessment.id)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          'Cannot disable group work while students have assessment instances. Remove their progress from the Students tab first.',
      });
    }

    const { newHash } = await runInTransactionAsync(async () => {
      await deleteAllGroups(ctx.assessment.id, ctx.authn_user.id);

      return await saveAssessmentGroupsBlock({
        ctx,
        origHash: input.origHash,
        applyChanges: (json) => {
          delete json.groups;
          return stripLegacyGroupKeys(json);
        },
        syncFailedMessage: 'Failed to disable group work.',
      });
    });

    return { origHash: newHash };
  });

async function selectGroupMembership(ctx: AssessmentTrpcCtx) {
  const groupConfig = await selectGroupConfigForAssessment(ctx.assessment.id);
  if (!groupConfig) {
    return { groups: [], notAssigned: [] };
  }

  const [groups, notAssigned] = await Promise.all([
    selectGroupsForConfig(groupConfig.id),
    selectUidsNotInGroup({
      group_config_id: groupConfig.id,
      course_instance_id: groupConfig.course_instance_id,
    }),
  ]);
  return { groups, notAssigned };
}

const membership = t.procedure
  .use(requireCourseInstancePermissionView)
  .query(async ({ ctx }) => await selectGroupMembership(ctx));

// Deploy-window compatibility shim: in-flight browser tabs loaded against the
// previous bundle still call `refreshGroups`. Keep through one release cycle,
// then delete in a follow-up PR once the new bundle has fully rolled out.
const refreshGroups = t.procedure
  .use(requireCourseInstancePermissionView)
  .mutation(async ({ ctx }) => await selectGroupMembership(ctx));

const randomizeGroups = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      minGroupSize: z.number().int().min(1),
      maxGroupSize: z.number().int().min(1),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    if (input.minGroupSize > input.maxGroupSize) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Minimum group size cannot be greater than maximum group size.',
      });
    }

    const jobSequenceId = await randomGroups({
      course_instance: ctx.course_instance,
      assessment: ctx.assessment,
      user_id: ctx.authn_user.id,
      authn_user_id: ctx.authn_user.id,
      min_group_size: input.minGroupSize,
      max_group_size: input.maxGroupSize,
      authzData: ctx.authz_data,
    });
    return { jobSequenceId };
  });

export const assessmentGroupsRouter = t.router({
  addGroup,
  editGroup,
  deleteGroup: deleteGroupProcedure,
  deleteAll,
  enableGroupWork,
  disableGroupWork,
  updateGroupConfig,
  membership,
  randomizeGroups,
  refreshGroups,
});
