const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const logger = require('../../lib/logger');
const workspaceHelper = require('../../lib/workspace');

const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:workspace_id', (req, res, _next) => {
    res.locals.workspace_id = req.params.workspace_id;
    res.locals.workspaceHeartbeatIntervalSec = config.workspaceHeartbeatIntervalSec;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.get('/:workspace_id/:action', asyncHandler(async (req, res, next) => {
    const workspace_id = req.params.workspace_id;
    const action = req.params.action;

    if (action === 'reboot') {
        logger.info(`Rebooting workspace ${workspace_id}.`);
        await workspaceHelper.updateState(workspace_id, 'stopped', 'Rebooting container');
        res.redirect(`/pl/workspace/${workspace_id}`);
    } else if (action === 'reset') {
        logger.info(`Resetting workspace ${workspace_id}.`);
        await workspaceHelper.updateState(workspace_id, 'uninitialized', 'Resetting container');
        await sqldb.queryAsync(sql.increment_workspace_version, {workspace_id});
        res.redirect(`/pl/workspace/${workspace_id}`);
    } else {
        return next(error.make(400, 'unknown action', {locals: res.locals, body: req.body}));
    }
}));

module.exports = router;
