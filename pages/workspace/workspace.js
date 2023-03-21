// @ts-check
const path = require('path');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const sqldb = require('@prairielearn/postgres');
const workspaceUtils = require('@prairielearn/workspace-utils');

const config = require('../../lib/config');

const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/error');

const { Workspace } = require('./workspace.html');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', (_req, res, _next) => {
  let navTitle;
  if (res.locals.assessment == null) {
    // instructor preview
    res.locals.pageNote = 'Preview';
    res.locals.pageTitle = res.locals.question_qid;
    navTitle = res.locals.pageTitle;
  } else {
    // student assessment
    navTitle = `${res.locals.instance_question_info.question_number} - ${res.locals.course.short_name}`;
  }

  res.send(
    Workspace({
      navTitle,
      showLogs: res.locals.authn_is_administrator || res.locals.authn_is_instructor,
      heartbeatIntervalSec: config.workspaceHeartbeatIntervalSec,
      visibilityTimeoutSec: config.workspaceVisibilityTimeoutSec,
      resLocals: res.locals,
    })
  );
});

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const workspace_id = res.locals.workspace_id;

    if (req.body.__action === 'reboot') {
      debug(`Rebooting workspace ${workspace_id}`);
      await workspaceUtils.updateWorkspaceState(workspace_id, 'stopped', 'Rebooting container');
      await sqldb.queryAsync(sql.update_workspace_rebooted_at_now, {
        workspace_id,
      });
      res.redirect(`/pl/workspace/${workspace_id}`);
    } else if (req.body.__action === 'reset') {
      debug(`Resetting workspace ${workspace_id}`);
      await workspaceUtils.updateWorkspaceState(
        workspace_id,
        'uninitialized',
        'Resetting container'
      );
      await sqldb.queryAsync(sql.increment_workspace_version, { workspace_id });
      res.redirect(`/pl/workspace/${workspace_id}`);
    } else {
      return next(error.make(400, `unknown __action: ${req.body.__action}`));
    }
  })
);

module.exports = router;
