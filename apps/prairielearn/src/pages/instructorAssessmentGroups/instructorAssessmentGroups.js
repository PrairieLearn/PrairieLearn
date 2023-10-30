// @ts-check
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { z } = require('zod');
const error = require('@prairielearn/error');
const { flash } = require('@prairielearn/flash');
const sqldb = require('@prairielearn/postgres');
const { html } = require('@prairielearn/html');

const sanitizeName = require('../../lib/sanitize-name');
const groups = require('../../lib/groups');
const groupUpdate = require('../../lib/group-update');
const { GroupConfigSchema, IdSchema } = require('../../lib/db-types');

const sql = sqldb.loadSqlEquiv(__filename);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    debug('GET /');
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    const prefix = sanitizeName.assessmentFilenamePrefix(
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

    res.locals.assessment_list_rows = await sqldb.queryRows(
      sql.assessment_list,
      {
        assessment_id: res.locals.assessment.id,
        course_instance_id: res.locals.config_info.course_instance_id,
      },
      z.object({
        id: IdSchema,
        tid: z.string().nullable(),
        title: z.string().nullable(),
      }),
    );

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
  asyncHandler(async (req, res, next) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_assessment_groups') {
      groupUpdate.uploadInstanceGroups(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        function (err, job_sequence_id) {
          if (ERR(err, next)) return;
          res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        },
      );
    } else if (req.body.__action === 'auto_assessment_groups') {
      groupUpdate.autoGroups(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        req.body.max_group_size,
        req.body.min_group_size,
        req.body.optradio,
        function (err, job_sequence_id) {
          if (ERR(err, next)) return;
          res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        },
      );
    } else if (req.body.__action === 'copy_assessment_groups') {
      await sqldb.callAsync('assessment_groups_copy', [
        res.locals.assessment.id,
        req.body.copy_assessment_id,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_all') {
      await groups.deleteAllGroups(res.locals.assessment.id, res.locals.authn_user.user_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_group') {
      const assessment_id = res.locals.assessment.id;
      const group_name = req.body.group_name;
      if (!group_name || String(group_name).length < 1) {
        flash('error', 'Group name cannot be empty.');
        res.redirect(req.originalUrl);
        return;
      }

      const uids = req.body.uids;
      const uidlist = uids.split(/[ ,]+/).filter((uid) => !!uid);
      if (uidlist.length === 0) {
        flash('error', 'Group must be created with at least one user.');
        res.redirect(req.originalUrl);
        return;
      }

      let updateList = [];
      uidlist.forEach((uid) => {
        updateList.push([group_name, uid]);
      });
      const params = [assessment_id, updateList, res.locals.authn_user.user_id];
      const result = await sqldb.callAsync('assessment_groups_update', params);

      const notExist = result.rows[0].not_exist_user;
      if (notExist) {
        flash(
          'error',
          html`Could not create group. The following users do not exist:
            <strong>${notExist.toString()}</strong>`,
        );
      }

      const inGroup = result.rows[0].already_in_group;
      if (inGroup) {
        flash(
          'error',
          html`Could not create group. The following users are already in another group:
            <strong>${inGroup.toString()}</strong>`,
        );
      }

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const uids = req.body.add_member_uids;
      const uidlist = uids.split(/[ ,]+/).filter((uid) => !!uid);
      let failedUids = [];
      for (const uid of uidlist) {
        let params = [assessment_id, group_id, uid, res.locals.authn_user.user_id];
        try {
          await sqldb.callAsync('assessment_groups_add_member', params);
        } catch (err) {
          failedUids.push(uid);
        }
      }
      if (failedUids.length > 0) {
        const uids = failedUids.join(', ');
        flash(
          'error',
          `Failed to add the following users: ${uids}. Please check if the users exist.`,
        );
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

module.exports = router;
