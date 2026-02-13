import { Router } from 'express';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { GroupConfigSchema } from '../../lib/db-types.js';
import { randomGroups, uploadInstanceGroups } from '../../lib/group-update.js';
import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  deleteAllGroups,
  deleteGroup,
  leaveGroup,
} from '../../lib/groups.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { parseUniqueValuesFromString } from '../../lib/string-util.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';

import {
  GroupUsersRowSchema,
  InstructorAssessmentGroups,
} from './instructorAssessmentGroups.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * The maximum number of UIDs that can be provided in a single request.
 */
const MAX_UIDS = 50;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const prefix = assessmentFilenamePrefix(
      res.locals.assessment,
      res.locals.assessment_set,
      res.locals.course_instance,
      res.locals.course,
    );
    const groupsCsvFilename = prefix + 'groups.csv';

    const groupConfigInfo = await sqldb.queryOptionalRow(
      sql.config_info,
      { assessment_id: res.locals.assessment.id },
      GroupConfigSchema,
    );

    if (!groupConfigInfo) {
      res.send(InstructorAssessmentGroups({ resLocals: res.locals }));
      return;
    }

    const groups = await sqldb.queryRows(
      sql.select_group_users,
      { group_config_id: groupConfigInfo.id },
      GroupUsersRowSchema,
    );

    const notAssigned = await sqldb.queryRows(
      sql.select_not_in_group,
      {
        group_config_id: groupConfigInfo.id,
        course_instance_id: groupConfigInfo.course_instance_id,
      },
      z.string(),
    );

    res.send(
      InstructorAssessmentGroups({
        resLocals: res.locals,
        groupsCsvFilename,
        groupConfigInfo,
        groups,
        notAssigned,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_assessment_groups') {
      const job_sequence_id = await uploadInstanceGroups({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        csvFile: req.file,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        authzData: res.locals.authz_data,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'random_assessment_groups') {
      const job_sequence_id = await randomGroups({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        user_id: res.locals.user.id,
        authn_user_id: res.locals.authn_user.id,
        max_group_size: Number(req.body.max_group_size),
        min_group_size: Number(req.body.min_group_size),
        authzData: res.locals.authz_data,
      });
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'delete_all') {
      await deleteAllGroups(res.locals.assessment.id, res.locals.authn_user.id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_group') {
      await createGroup({
        course_instance: res.locals.course_instance,
        assessment: res.locals.assessment,
        group_name: req.body.group_name,
        uids: parseUniqueValuesFromString(req.body.uids, MAX_UIDS),
        authn_user_id: res.locals.authn_user.id,
        authzData: res.locals.authz_data,
      }).catch((err) => {
        if (err instanceof GroupOperationError) {
          flash('error', err.message);
        } else {
          throw err;
        }
      });

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_member') {
      for (const uid of parseUniqueValuesFromString(req.body.add_member_uids, MAX_UIDS)) {
        try {
          await addUserToGroup({
            course_instance: res.locals.course_instance,
            assessment: res.locals.assessment,
            group_id: req.body.group_id,
            uid,
            authn_user_id: res.locals.authn_user.id,
            enforceGroupSize: false, // Enforce group size limits (instructors can override limits)
            authzData: res.locals.authz_data,
          });
        } catch (err) {
          if (err instanceof GroupOperationError) {
            flash('error', `Failed to add the user ${uid}: ${err.message}`);
          } else {
            throw err;
          }
        }
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const user_id = req.body.user_id;
      await leaveGroup(assessment_id, user_id, res.locals.authn_user.id, group_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_group') {
      await deleteGroup(res.locals.assessment.id, req.body.group_id, res.locals.authn_user.id);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
