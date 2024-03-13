import asyncHandler = require('express-async-handler');
import * as express from 'express';
import { z } from 'zod';
import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { assessmentFilenamePrefix } from '../../lib/sanitize-name';
import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  deleteAllGroups,
  deleteGroup,
  leaveGroup,
} from '../../lib/groups';
import { uploadInstanceGroups, autoGroups } from '../../lib/group-update';
import { GroupConfigSchema } from '../../lib/db-types';
import { InstructorAssessmentGroups, GroupUsersRowSchema } from './instructorAssessmentGroups.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
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
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_assessment_groups') {
      const job_sequence_id = await uploadInstanceGroups(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'auto_assessment_groups') {
      const job_sequence_id = await autoGroups(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        req.body.max_group_size,
        req.body.min_group_size,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'delete_all') {
      await deleteAllGroups(res.locals.assessment.id, res.locals.authn_user.user_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_group') {
      const assessment_id = res.locals.assessment.id;
      const group_name = req.body.group_name;

      const uids = req.body.uids;
      const uidlist = uids.split(/[ ,]+/).filter((uid) => !!uid);
      await createGroup(group_name, assessment_id, uidlist, res.locals.authn_user.user_id).catch(
        (err) => {
          if (err instanceof GroupOperationError) {
            flash('error', err.message);
          } else {
            throw err;
          }
        },
      );

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const uids = req.body.add_member_uids;
      const uidlist = uids.split(/[ ,]+/).filter((uid) => !!uid);
      for (const uid of uidlist) {
        try {
          await addUserToGroup({
            assessment_id,
            group_id,
            uid,
            authn_user_id: res.locals.authn_user.user_id,
            enforceGroupSize: false, // Enforce group size limits (instructors can override limits)
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
      await leaveGroup(assessment_id, user_id, res.locals.authn_user.user_id, group_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_group') {
      await deleteGroup(res.locals.assessment.id, req.body.group_id, res.locals.authn_user.user_id);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
