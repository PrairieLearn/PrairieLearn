const util = require('util');

const { config } = require('../lib/config');
const { logger } = require('@prairielearn/logger');
const workspaceUtils = require('@prairielearn/workspace-utils');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

module.exports = {};

module.exports.runAsync = async () => {
  const params = {
    launched_timeout_sec: config.workspaceLaunchedTimeoutSec,
    launched_timeout_warn_sec: config.workspaceLaunchedTimeoutWarnSec,
  };
  const result = await sqldb.queryAsync(sql.select_almost_launched_timeout_workspaces, params);
  const workspaces = result.rows;
  for (const workspace of workspaces) {
    logger.verbose(`workspaceTimeoutWarn: timeout warning for workspace_id = ${workspace.id}`);
    const time_to_timeout_min = Math.ceil(workspace.time_to_timeout_sec / 60);
    await workspaceUtils.updateWorkspaceMessage(
      workspace.id,
      `WARNING: This workspace will stop in < ${time_to_timeout_min} min. Click "Reboot" to keep working.`
    );
  }
};
module.exports.run = util.callbackify(module.exports.runAsync);
