const path = require('path');
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const workspaceHelper = require('../../lib/workspace');

const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

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
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.get('/:action', asyncHandler(async (req, res, next) => {
    const workspace_id = res.locals.workspace_id;
    const action = req.params.action;

    if (action === 'reboot') {
        debug(`Rebooting workspace ${workspace_id}`);
        await workspaceHelper.updateState(workspace_id, 'stopped', 'Rebooting container');
        res.redirect(`/pl/workspace/${workspace_id}`);
    } else if (action === 'reset') {
        debug(`Resetting workspace ${workspace_id}`);
        await workspaceHelper.updateState(workspace_id, 'uninitialized', 'Resetting container');
        await sqldb.queryAsync(sql.increment_workspace_version, {workspace_id});
        res.redirect(`/pl/workspace/${workspace_id}`);
    } else {
        return next(error.make(400, 'unknown action', {locals: res.locals, body: req.body}));
    }
}));

module.exports = router;
