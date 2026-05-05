import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { runInTransactionAsync } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  deleteAllGroups,
  deleteGroup,
  leaveGroup,
} from '../../lib/groups.js';
import { parseUniqueValuesFromString } from '../../lib/string-util.js';
import { selectGroupById, selectNotAssignedForAssessment } from '../../models/group.js';
import { throwAppError } from '../app-errors.js';

import { requireCourseInstancePermissionEdit, t } from './init.js';

const MAX_UIDS = 50;

export interface AssessmentGroupsError {
  AddGroup: { code: 'GROUP_OPERATION_FAILED' };
  EditGroup: { code: 'GROUP_OPERATION_FAILED' };
  DeleteGroup: { code: 'GROUP_OPERATION_FAILED' };
}

const addGroup = t.procedure
  .use(requireCourseInstancePermissionEdit)
  .input(
    z.object({
      group_name: z.string(),
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
        group_name: input.group_name || null,
        uids: parseUniqueValuesFromString(input.uids, MAX_UIDS),
        authn_user_id: authn_user.id,
        authzData: authz_data,
      });
      createdGroupId = group.id;
    } catch (err) {
      if (err instanceof GroupOperationError) {
        throwAppError<AssessmentGroupsError['AddGroup']>({
          code: 'GROUP_OPERATION_FAILED',
          message: err.message,
        });
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
      group_id: IdSchema,
      uids: z.string(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { course_instance, assessment, authn_user, authz_data } = ctx;

    const desiredUids = parseUniqueValuesFromString(input.uids, MAX_UIDS);

    const currentGroup = await selectGroupById({
      group_id: input.group_id,
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
          await leaveGroup(assessment.id, user.id, authn_user.id, input.group_id);
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
            group_id: input.group_id,
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
      selectGroupById({ group_id: input.group_id, assessment_id: assessment.id }),
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
      group_id: IdSchema,
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { assessment, authn_user, course_instance } = ctx;

    try {
      await deleteGroup(assessment.id, input.group_id, authn_user.id);
    } catch (err) {
      if (err instanceof GroupOperationError) {
        throwAppError<AssessmentGroupsError['DeleteGroup']>({
          code: 'GROUP_OPERATION_FAILED',
          message: err.message,
        });
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

export const assessmentGroupsRouter = t.router({
  addGroup,
  editGroup,
  deleteGroup: deleteGroupProcedure,
  deleteAll,
});
