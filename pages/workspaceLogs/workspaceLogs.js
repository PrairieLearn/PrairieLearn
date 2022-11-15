// @ts-check
const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const AWS = require('aws-sdk');
const z = require('zod');

const config = require('../../lib/config');
const error = require('../../prairielib/lib/error');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const { WorkspaceLogs, WorkspaceVersionLogs } = require('./workspaceLogs.html');

const sql = sqlLoader.loadSqlEquiv(__filename);

/**
 * Loads logs for the given workspace version from S3. If logs cannot be found,
 * returns null.
 *
 * @param {string | number} workspaceId
 * @param {string | number} version
 * @param {string} [startAfter]
 *
 * @returns {Promise<{ logs: string, startAfter: string} | null>}
 */
async function loadLogParts(workspaceId, version, startAfter) {
  // TODO: handle errors and missing data.
  const s3Client = new AWS.S3({ maxRetries: 3 });
  const logItems = await s3Client
    .listObjectsV2({
      Bucket: config.workspaceLogsS3Bucket,
      Prefix: `${workspaceId}/${version}/`,
      MaxKeys: 10,
      StartAfter: startAfter,
    })
    .promise();

  if (logItems.Contents.length === 0) {
    return {
      logs: '',
      // If we couldn't load any more logs, reuse the same startAfter key.
      startAfter,
    };
  }

  const logParts = await Promise.all(
    logItems.Contents.map(async (item) => {
      const res = await s3Client
        .getObject({
          Bucket: config.workspaceLogsS3Bucket,
          Key: item.Key,
        })
        .promise();
      return res.Body.toString('utf-8');
    })
  );

  const logs = logParts.join('');
  return {
    logs,
    startAfter: logItems.Contents[logItems.Contents.length - 1].Key,
  };
}

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
      display_timezone:
        res.locals.course_instance.display_timezone ?? res.locals.course.display_timezone,
    });
    res.send(WorkspaceLogs({ workspaceLogs: workspaceLogs.rows, resLocals: res.locals }));
  })
);

// All state transitions for a single workspace version, as well as the container
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
    res.send(
      WorkspaceVersionLogs({
        version: req.params.version,
        workspaceLogs: workspaceLogs.rows,
        containerLogsEnabled: areContainerLogsEnabled(),
        containerLogsExpired: areContainerLogsExpired(workspaceLogs.rows),
        resLocals: res.locals,
      })
    );
  })
);

// Fetches a chunk of logs from S3, optionally offset by a given `start_after`
// query param. If present, `start_after` should be the S3 key of the last log
// chunk that was fetched.
router.get(
  '/version/:version/container_logs',
  asyncHandler(async (req, res, _next) => {
    const startAfter = z.string().optional().parse(req.query.start_after);

    // Check if the container logs have expired for this workspace version, or
    // if they're disabled.
    const workspaceLogs = await sqldb.queryAsync(sql.select_workspace_version_logs, {
      workspace_id: res.locals.workspace_id,
      version: req.params.version,
      display_timezone:
        res.locals.course_instance.display_timezone ?? res.locals.course.display_timezone,
    });
    if (!areContainerLogsEnabled() || areContainerLogsExpired(workspaceLogs.rows)) {
      res.sendStatus(404);
      return;
    }

    const logs = await loadLogParts(res.locals.workspace_id, req.params.version, startAfter);
    if (!logs.logs) {
      res.sendStatus(404);
    } else {
      res.set('X-Next-Start-After', logs.startAfter);
      res.send(logs.logs);
    }
  })
);

module.exports = router;
