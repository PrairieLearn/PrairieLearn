const asyncHandler = require('express-async-handler');

const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = asyncHandler(async (req, res) => {
  const hostname = await sqldb.queryZeroOrOneRowAsync(sql.select_workspace_hostname, {
    workspace_id: res.locals.workspace_id,
  });

  if (hostname.rows.length === 0) {
    // Either no such workspace exists, or the workspace is not running.
    // Send a 404; we don't use a 50x here so as not to flood our error logs
    // with unactionable errors.
    res.status(404).send();
    return;
  }

  // Normally we'd attach this to `res.locals`, but we need to access it in
  // the `router` function in our proxying middleware, and that only has access
  // to the request object.
  req.workspace_hostname = hostname.rows[0].hostname;
});
