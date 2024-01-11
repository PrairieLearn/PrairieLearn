// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import * as path from 'path';
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
import { z } from 'zod';
import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { html } from '@prairielearn/html';

import { assessmentFilenamePrefix } from '../../lib/sanitize-name';
import { addUserToGroup, createGroup, deleteAllGroups } from '../../lib/groups';
import { uploadInstanceGroups, autoGroups } from '../../lib/group-update';
import { GroupConfigSchema, IdSchema } from '../../lib/db-types';
import { selectUserByUid } from '../../models/user';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    debug('GET /');
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    const prefix = assessmentFilenamePrefix(
      res.locals.assessment,
      res.locals.assessment_set,
      res.locals.course_instance,
      res.locals.course,
    );
    res.locals.groupsCsvFilename = prefix + 'groups.csv';

    const groupConfig = await sqldb.queryOptionalRow(
      sql.config_info,
      { assessment_id: res.locals.assessment.id },
      GroupConfigSchema,
    );
    res.locals.isGroup = !!groupConfig;
    if (!groupConfig) {
      res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
      return;
    }
    res.locals.config_info = groupConfig;
    res.locals.config_info.defaultMin = groupConfig.minimum || 2;
    res.locals.config_info.defaultMax = groupConfig.maximum || 5;

    res.locals.groups = await sqldb.queryRows(
      sql.select_group_users,
      {
        group_config_id: res.locals.config_info.id,
      },
      z.object({
        group_id: IdSchema,
        name: z.string(),
        size: z.number(),
        uid_list: z.array(z.string()),
      }),
    );

    res.locals.notAssigned = await sqldb.queryRows(
      sql.select_not_in_group,
      {
        group_config_id: res.locals.config_info.id,
        course_instance_id: res.locals.config_info.course_instance_id,
      },
      z.string(),
    );

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
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
      const userIdList = [];
      const notExist = [];
      for (const uid of uidlist) {
        const user = await selectUserByUid(uid);
        if (user == null) {
          notExist.push(uid);
        } else {
          userIdList.push(user.user_id);
        }
      }

      if (notExist.length > 0) {
        flash(
          'error',
          html`Could not create group. The following users do not exist:
            <strong>${notExist.toString()}</strong>`,
        );
      } else {
        await createGroup(group_name, assessment_id, userIdList, res.locals.authn_user.user_id);
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const uids = req.body.add_member_uids;
      const uidlist = uids.split(/[ ,]+/).filter((uid) => !!uid);
      for (const uid of uidlist) {
        const user = await selectUserByUid(uid);
        if (!user) {
          flash('error', `Failed to add the user ${uid}: User does not exist.`);
          continue;
        }

        try {
          await addUserToGroup(
            assessment_id,
            group_id,
            user.user_id,
            res.locals.authn_user.user_id,
            false, // Enforce group size limits (instructors can override limits)
          );
        } catch (err) {
          flash('error', `Failed to add the user ${uid}: ${err.message}`);
        }
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const uids = req.body.delete_member_uids;
      const uidlist = uids.split(/[ ,]+/).filter((uid) => !!uid);
      let failedUids = [];
      for (const uid of uidlist) {
        let params = [assessment_id, group_id, uid, res.locals.authn_user.user_id];
        try {
          await sqldb.callAsync('assessment_groups_delete_member', params);
        } catch (err) {
          failedUids.push(uid);
        }
      }
      if (failedUids.length > 0) {
        const uids = failedUids.join(', ');
        flash(
          'error',
          `Failed to remove the following users: ${uids}. Please check if the users exist.`,
        );
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_group') {
      await sqldb.callAsync('assessment_groups_delete_group', [
        res.locals.assessment.id,
        req.body.group_id,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, 'unknown __action', {
        locals: res.locals,
        body: req.body,
      });
    }
  }),
);

export default router;
