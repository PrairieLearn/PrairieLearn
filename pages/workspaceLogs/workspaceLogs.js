// @ts-check
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const { WorkspaceLogs, WorkspaceVersionLogs } = require('./workspaceLogs.html');

const sql = sqlLoader.loadSqlEquiv(__filename);

// Overview of workspace logs, including all state transitions and links to
// logs for individual versions.
router.get(
  '/',
  asyncHandler(async (_req, res, _next) => {
    const workspaceLogs = await sqldb.queryAsync(sql.select_workspace_logs, {
      workspace_id: res.locals.workspace_id,
      display_timezone:
        res.locals.course_instance.display_timezone ?? res.locals.course.display_timezone,
    });
    res.locals.viewType = 'instructor';
    res.send(WorkspaceLogs({ workspaceLogs: workspaceLogs.rows, resLocals: res.locals }));
  })
);

// All state transitions for a single workspace version, as wel as the container
// output that's been stored in S3.
router.get(
  '/version/:version',
  asyncHandler(async (req, res, _next) => {
    const workspaceLogs = await sqldb.queryAsync(sql.select_workspace_version_logs, {
      workspace_id: res.locals.workspace_id,
      version: req.params.version,
      display_timezone:
        res.locals.course_instance.display_timezone ?? res.locals.course.display_timezone,
    });
    res.locals.viewType = 'instructor';
    res.send(
      WorkspaceVersionLogs({
        workspaceLogs: workspaceLogs.rows,
        resLocals: res.locals,
      })
    );
  })
);

router.get(
  '/version/:version/container_logs',
  asyncHandler(async (req, res, _next) => {
    // List all items in the
    const fromKey = req.query.from_key;
    res.send('foo');
  })
);

module.exports = router;
