// @ts-check
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const AWS = require('aws-sdk');

const { config } = require('../../lib/config');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const { WorkspaceLogs, WorkspaceVersionLogs } = require('./workspaceLogs.html');
const fetch = require('node-fetch').default;

const sql = sqldb.loadSqlEquiv(__filename);

/**
 * Given a list of workspace logs for a specific version sorted by date in
 * ascending order, checks if the logs are considered expired.
 *
 * @param {any[]} workspaceLogs
 * @returns {boolean}
 */
function areContainerLogsExpired(workspaceLogs) {
  if (config.workspaceLogsExpirationDays === null) {
    // Expiration is disabled.
    return false;
  }

  if (workspaceLogs.length === 0) return false;
  const firstLog = workspaceLogs[0];
  return firstLog.date < config.workspaceLogsExpirationDays * 24 * 60 * 60 * 1000;
}

function areContainerLogsEnabled() {
  return config.workspaceLogsS3Bucket !== null;
}

/**
 * Loads all the logs for a given workspace version.
 *
 * The logs for the current running version, if any, are fetched from the
 * workspace host directly. We also load all the logs for the given version
 * from S3. Together, this gives us all the logs for the given version.
 *
 * @returns {Promise<string | null>}
 */
async function loadLogsForWorkspaceVersion(workspaceId, version) {
  // Safety check for TypeScript.
  if (!config.workspaceLogsS3Bucket) return null;

  // Get the current workspace version.
  const workspaceRes = await sqldb.queryOneRowAsync(sql.select_workspace, {
    workspace_id: workspaceId,
    version,
  });
  const workspace = workspaceRes.rows[0];

  const logParts = [];

  // Load the logs from S3. When workspaces are rebooted, we write the logs to
  // an object before shutting down the container. This means that we may have
  // multiple objects for each container. Load all of them. The objects are keyed
  // such that they are sorted by date, so we can just load them in order.
  const s3Client = new AWS.S3({ maxRetries: 3 });
  const logItems = await s3Client
    .listObjectsV2({
      Bucket: config.workspaceLogsS3Bucket,
      Prefix: `${workspaceId}/${version}/`,
      MaxKeys: 1000,
    })
    .promise();

  // Load all parts serially to avoid hitting S3 rate limits.
  for (const item of logItems.Contents ?? []) {
    // This should never happen, but the AWS SDK types annoyingly list this as
    // possible undefined.
    if (!item.Key) continue;

    const res = await s3Client
      .getObject({
        Bucket: config.workspaceLogsS3Bucket,
        Key: item.Key,
      })
      .promise();

    // Once again, the AWS SDK types aren't narrow enough. This should never be
    // falsy in practice.
    if (res.Body) {
      res.Body.toString('utf-8');
    }
  }

  // If the current workspace version matches the requested version, we can
  // reach out to the workspace host directly to get the remaining logs. Otherwise,
  // they should have been flushed to S3 already.
  if (workspace.state === 'running' && workspace.is_current_version && workspace.hostname) {
    const res = await fetch(`http://${workspace.hostname}/`, {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, action: 'getLogs' }),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      logParts.push(await res.text());
    }
  }

  return logParts.join('');
}

// Only instructors and admins can access these routes. We don't need to check
// if the instructor has access to the workspace; that's already been checked
// by the workspace authorization middleware.
router.use((req, res, next) => {
  // TODO: is `authn_is_instructor` the right permission to check?
  if (!res.locals.authn_is_administrator && !res.locals.authn_is_instructor) {
    next(error.make(403, 'Access denied'));
  } else {
    next();
  }
});

// Overview of workspace logs, including all state transitions and links to
// logs for individual versions.
router.get(
  '/',
  asyncHandler(async (_req, res, _next) => {
    const workspaceLogs = await sqldb.queryAsync(sql.select_workspace_logs, {
      workspace_id: res.locals.workspace_id,
      workspace_version: null,
      display_timezone:
        res.locals.course_instance?.display_timezone ?? res.locals.course.display_timezone,
    });
    res.send(WorkspaceLogs({ workspaceLogs: workspaceLogs.rows, resLocals: res.locals }));
  })
);

// All state transitions for a single workspace version, as well as the container
// output that's been stored in S3.
router.get(
  '/version/:version',
  asyncHandler(async (req, res, _next) => {
    const workspaceLogs = await sqldb.queryAsync(sql.select_workspace_logs, {
      workspace_id: res.locals.workspace_id,
      workspace_version: req.params.version,
      display_timezone:
        res.locals.course_instance?.display_timezone ?? res.locals.course.display_timezone,
    });
    const containerLogsEnabled = areContainerLogsEnabled();
    const containerLogsExpired = areContainerLogsExpired(workspaceLogs.rows);

    let containerLogs = null;
    if (containerLogsEnabled && !containerLogsExpired) {
      containerLogs = await loadLogsForWorkspaceVersion(
        res.locals.workspace_id,
        req.params.version
      );
    }

    res.send(
      WorkspaceVersionLogs({
        workspaceLogs: workspaceLogs.rows,
        containerLogs,
        containerLogsEnabled,
        containerLogsExpired,
        resLocals: res.locals,
      })
    );
  })
);

module.exports = router;
