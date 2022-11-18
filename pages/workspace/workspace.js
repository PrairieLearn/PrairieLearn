const path = require('path');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const workspaceHelper = require('../../lib/workspace');

const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('../../prairielib/lib/error');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (_req, res, _next) => {
  res.locals.workspaceHeartbeatIntervalSec = config.workspaceHeartbeatIntervalSec;
  if (res.locals.assessment == null) {
    // instructor preview
    res.locals.pageNote = 'Preview';
    res.locals.pageTitle = res.locals.question_qid;
    res.locals.navTitle = res.locals.pageTitle;
  } else {
    // student assessment
    res.locals.navTitle = `${res.locals.instance_question_info.question_number} - ${res.locals.course.short_name}`;
  }
  res.locals.showLogs = res.locals.authn_is_administrator || res.locals.authn_is_instructor;
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post(
  '/',
  asyncHandler(async (req, res, next) => {
    const workspace_id = res.locals.workspace_id;

    if (req.body.__action === 'reboot') {
      debug(`Rebooting workspace ${workspace_id}`);
      await workspaceHelper.updateState(workspace_id, 'stopped', 'Rebooting container');
      await sqldb.queryAsync(sql.update_workspace_rebooted_at_now, {
        workspace_id,
      });
      res.redirect(`/pl/workspace/${workspace_id}`);
    } else if (req.body.__action === 'reset') {
      debug(`Resetting workspace ${workspace_id}`);
      await workspaceHelper.updateState(workspace_id, 'uninitialized', 'Resetting container');
      await sqldb.queryAsync(sql.increment_workspace_version, { workspace_id });
      res.redirect(`/pl/workspace/${workspace_id}`);
    } else {
      return next(error.make(400, `unknown __action: ${req.body.__action}`));
    }
  })
);

module.exports = router;
