const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const config = require('../../lib/config');
const logger = require('../../lib/logger');
const workspaceHelper = require('../../lib/workspace');

const error = require('@prairielearn/prairielib/error');

router.get('/', (req, res, _next) => {
    res.locals.workspaceHeartbeatIntervalSec = config.workspaceHeartbeatIntervalSec;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.get('/:action', asyncHandler(async (req, res, next) => {
    const workspace_id = res.locals.workspace_id;
    const action = req.params.action;

    if (action === 'reboot') {
        logger.info(`Rebooting workspace ${workspace_id}.`);
        await workspaceHelper.updateState(workspace_id, 'stopped', 'Rebooting container');
        res.redirect(`/pl/workspace/${workspace_id}`);
    } else {
        return next(error.make(400, 'unknown action', {locals: res.locals, body: req.body}));
    }
}));

module.exports = router;
