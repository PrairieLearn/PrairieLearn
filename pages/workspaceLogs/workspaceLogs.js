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
  const s3Client = new AWS.S3();
  const logItems = await s3Client
    .listObjectsV2({
      Bucket: config.workspaceLogsS3Bucket,
      Prefix: `${workspaceId}/${version}/`,
      MaxKeys: 10,
      StartAfter: startAfter,
    })
    .promise();

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
    // If we couldn't load any more logs, reuse the same startAfter key.
    startAfter: logItems.Contents?.[logItems.Contents.length - 1]?.Key ?? startAfter,
  };
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
    res.send(
      WorkspaceVersionLogs({
        version: req.params.version,
        workspaceLogs: workspaceLogs.rows,
        resLocals: res.locals,
      })
    );
  })
);

const startAfterSchema = z.string().optional();

router.get(
  '/version/:version/container_logs',
  asyncHandler(async (req, res, _next) => {
    const startAfter = startAfterSchema.parse(req.query.start_after);
    const logs = await loadLogParts(res.locals.workspace_id, req.params.version, startAfter);
    if (logs.startAfter) {
      res.set('X-Next-Start-After', logs.startAfter);
    }
    res.send(logs.logs);
  })
);

module.exports = router;
