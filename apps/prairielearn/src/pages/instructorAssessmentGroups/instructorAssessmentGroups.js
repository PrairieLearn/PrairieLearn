// @ts-check
const ERR = require('async-stacktrace');
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { z } = require('zod');

const sanitizeName = require('../../lib/sanitize-name');
const error = require('@prairielearn/error');
const groupUpdate = require('../../lib/group-update');
const sqldb = require('@prairielearn/postgres');
const { GroupConfigSchema, IdSchema } = require('../../lib/db-types');

const sql = sqldb.loadSqlEquiv(__filename);

/*
 * This function run all needed SQL queries to load the page at the same time
 * that res passed in will be saved. e.g res.locals.errormsg from POST functions
 * can be displayed on the frontend.
 */
async function obtainInfo(req, res) {
  const prefix = sanitizeName.assessmentFilenamePrefix(
    res.locals.assessment,
    res.locals.assessment_set,
    res.locals.course_instance,
    res.locals.course
  );
  res.locals.groupsCsvFilename = prefix + 'groups.csv';

  const groupConfig = await sqldb.queryOptionalRow(
    sql.config_info,
    { assessment_id: res.locals.assessment.id },
    GroupConfigSchema
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
    })
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
      // TODO: what actually is the type of this thing?
      uid_list: z.array(z.string()),
    })
  );

  res.locals.notAssigned = await sqldb.queryRows(
    sql.select_not_in_group,
    {
      group_config_id: res.locals.config_info.id,
      course_instance_id: res.locals.config_info.course_instance_id,
    },
    z.string()
  );

  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
}
router.get(
  '/',
  asyncHandler(async (req, res) => {
    debug('GET /');
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    await obtainInfo(req, res);
  })
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
        }
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
        }
      );
    } else if (req.body.__action === 'copy_assessment_groups') {
      await sqldb.callAsync('assessment_groups_copy', [
        res.locals.assessment.id,
        req.body.copy_assessment_id,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_all') {
      sqldb.callAsync('assessment_groups_delete_all', [
        res.locals.assessment.id,
        res.locals.authn_user.user_id,
      ]);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_group') {
      const assessment_id = res.locals.assessment.id;
      const group_name = req.body.group_name;
      if (!group_name || String(group_name).length < 1) {
        res.locals.errormsg = 'Please enter a group name when adding a group';
        await obtainInfo(req, res);
        return;
      }
      const uids = req.body.uids;
      const uidlist = uids.split(/[ ,]+/);
      res.locals.errormsg = '';
      let updateList = [];
      uidlist.forEach((uid) => {
        updateList.push([group_name, uid]);
      });
      const params = [assessment_id, updateList, res.locals.authn_user.user_id];
      const result = await sqldb.callAsync('assessment_groups_update', params);
      const notExist = result.rows[0].not_exist_user;
      if (notExist) {
        res.locals.errormsg +=
          'ERROR when adding group ' +
          group_name +
          ' - [' +
          notExist.toString() +
          ']. Please check if the group name is unique and whether their uids are correct.';
      }
      const inGroup = result.rows[0].already_in_group;
      if (inGroup) {
        res.locals.errormsg +=
          'ERROR when adding group ' +
          group_name +
          ' - [' +
          inGroup.toString() +
          '] are already in another group.';
      }
      await obtainInfo(req, res);
    } else if (req.body.__action === 'add_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const uids = req.body.add_member_uids;
      const uidlist = uids.split(/[ ,]+/);
      let failedUids = '';
      res.locals.errormsg = '';
      for (const uid of uidlist) {
        let params = [assessment_id, group_id, uid, res.locals.authn_user.user_id];
        try {
          await sqldb.callAsync('assessment_groups_add_member', params);
        } catch (err) {
          failedUids += '[' + uid + '] ';
        }
      }
      if (failedUids.length > 0) {
        res.locals.errormsg += 'Failed to add ' + failedUids + '. Please check if the uid exist.\n';
      }
      await obtainInfo(req, res);
    } else if (req.body.__action === 'delete_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const uids = req.body.delete_member_uids;
      const uidlist = uids.split(/[ ,]+/);
      let failedUids = '';
      res.locals.errormsg = '';
      for (const uid of uidlist) {
        let params = [assessment_id, group_id, uid, res.locals.authn_user.user_id];
        try {
          await sqldb.callAsync('assessment_groups_delete_member', params);
        } catch (err) {
          failedUids += '[' + uid + '] ';
        }
      }
      if (failedUids.length > 0) {
        res.locals.errormsg +=
          'Failed to remove ' + failedUids + '. Please check if the uid exist.\n';
      }
      await obtainInfo(req, res);
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
  })
);

module.exports = router;
