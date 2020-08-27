const util = require('util');

const config = require('../lib/config');
const logger = require('../lib/logger');
const workspaceHelper = require('../lib/workspace');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

async function stopLaunchedTimeoutWorkspaces() {
    const params = {
        launched_timeout_sec: config.workspaceLaunchedTimeoutSec,
    };
    const result = await sqldb.queryAsync(sql.select_launched_timeout_workspaces, params);
    const workspaces = result.rows;
    for (const workspace of workspaces) {
        logger.verbose(`stopStaleWorkspaces: launched timeout for workspace_id = ${workspace.id}`);
        await workspaceHelper.updateState(workspace.id, 'stopped', `Maximum run time of ${config.workspaceLaunchedTimeoutSec / 3600} hours exceeded`);
    }
}

async function stopHeartbeatTimeoutWorkspaces() {
    const params = {
        heartbeat_timeout_sec: config.workspaceHeartbeatTimeoutSec,
    };
    const result = await sqldb.queryAsync(sql.select_heartbeat_timeout_workspaces, params);
    const workspaces = result.rows;
    for (const workspace of workspaces) {
        logger.verbose(`stopStaleWorkspaces: heartbeat timeout for workspace_id = ${workspace.id}`);
        await workspaceHelper.updateState(workspace.id, 'stopped', `Connection was lost for more than ${config.workspaceHeartbeatTimeoutSec / 60} minutes`);
    }
}

async function stopInLaunchingTimeoutWorkspaces() {
    const params = {
        in_launching_timeout_sec: config.workspaceInLaunchingTimeoutSec,
    };
    const result = await sqldb.queryAsync(sql.select_in_launching_timeout_workspaces, params);
    const workspaces = result.rows;
    for (const workspace of workspaces) {
        // these are errors because timeouts should have been enforced
        // by the workspace hosts
        logger.error(`stopStaleWorkspaces: in-launching timeout for workspace_id = ${workspace.id}`);
        await workspaceHelper.updateState(workspace.id, 'stopped', `Maximum launching time of ${config.workspaceInLaunchingTimeoutSec / 60} minutes exceeded`);
    }
}

module.exports.run = function(callback) {
    util.callbackify(async () => {
        await stopLaunchedTimeoutWorkspaces();
        await stopHeartbeatTimeoutWorkspaces();
        await stopInLaunchingTimeoutWorkspaces();
})(callback);
};
