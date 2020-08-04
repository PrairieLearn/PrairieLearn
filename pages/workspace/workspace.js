const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');

const logger = require('../../lib/logger');
const workspace = require('../../lib/workspace');

const error = require('@prairielearn/prairielib/error');

router.get('/:workspace_id', (req, res, _next) => {
    const workspace_id = req.params.workspace_id;
    res.locals.workspace_id = workspace_id;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.get('/:workspace_id/:action', asyncHandler(async (req, res, next) => {
    const workspace_id = req.params.workspace_id;
    const action = req.params.action;

    if (action === 'reboot') {
        logger.info(`[workspace.js] Rebooting workspace ${workspace_id}.`);
        const state = 'stopped';
        await workspace.updateState(workspace_id, state);
        res.redirect(`/workspace/${workspace_id}`);
    } else if (action === 'grade') {
        await workspace.controlContainer(workspace_id, 'grade');
        res.redirect(`/workspace/${workspace_id}`);     // refresh anyway
    } else {
        return next(error.make(400, 'unknown action', {locals: res.locals, body: req.body}));
    }
}));

module.exports = router;
