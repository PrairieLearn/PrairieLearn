const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');
const async = require('async');

const config = require('../../lib/config');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

// https://stackoverflow.com/a/46213474/13138364
const s3Sync = function (s3Path, bucketName) {
    const s3 = new AWS.S3();

    function walkSync(currentDirPath, callback) {
        fs.readdirSync(currentDirPath).forEach(function (name) {
            const filePath = path.join(currentDirPath, name);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                callback(filePath, stat);
            } else if (stat.isDirectory()) {
                walkSync(filePath, callback);
            }
        });
    }

    walkSync(s3Path, function (filePath, _stat) {
        const bucketPath = filePath.substring(s3Path.length + 1);
        const params = {
            Bucket: bucketName,
            Key: bucketPath,
            Body: fs.readFileSync(filePath),
        };
        s3.putObject(params, function (err, _data) {
            if (err) {
                console.log(err);
            } else {
                console.log(`[workspace.js] synced ${bucketPath} to ${bucketName}`);
            }
        });

    });
};

router.get('/:workspace_id', (req, res, next) => {
    res.locals.workspace_id = req.params.workspace_id;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);

    const params = {
        workspace_id: res.locals.workspace_id,
    };
    async.series([
        (callback) => {
            sqldb.queryOneRow(sql.select_workspace_paths, params, function(err, result) {
                if (ERR(err, next)) return;

                const course_path = result.rows[0].course_path;
                const question_qid = result.rows[0].question_qid;

                const workspaceLocalPath = `${course_path}/questions/${question_qid}/workspace`;
                const workspaceS3Path = `${config.workspaceS3Bucket}/workspace-${params.workspace_id}`;

                console.log(`[workspace.js] syncing ${workspaceLocalPath} to ${workspaceS3Path}`);
                s3Sync(workspaceLocalPath, workspaceS3Path);
                callback(null);
            });
        },
        (callback) => {
            // TODO: add locking
            sqldb.query(sql.update_workspace_state, params, function(err, _result) {
                if (ERR(err, next)) return;
                console.log(`[workspace.js] set workspaces.state to 'stopped'`);
            });
        },
    ], (err) => {
        if (ERR(err, next)) return;
    });
});

module.exports = router;
