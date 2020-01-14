const ERR = require('async-stacktrace');
const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:announcement_id', function(req, res, next) {
    const params = {
        announcement_id: req.params.announcement_id,
        user_id: res.locals.authn_user.user_id,
        course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
        course_id: res.locals.course ? res.locals.course.id : null,
    }
    sqldb.queryZeroOrOneRow(sql.select_announcement_for_read, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(new Error(`invalid announcement_id: ${req.params.announcement_id}`));

        res.locals.announcement = result.rows[0];

        const indexFilename = path.join(__dirname, '..', '..', 'announcements', res.locals.announcement.directory, 'index.html');
        fs.readFile(indexFilename, (err, index_html) => {
            if (ERR(err, next)) return;

            res.locals.index_html = index_html;
        
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});

router.get('/:announcement_id/*', function(req, res, next) {
    const filename = req.params[0];
    const params = {
        announcement_id: req.params.announcement_id,
    }
    sqldb.queryZeroOrOneRow(sql.select_announcement, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(new Error(`invalid announcement_id: ${req.params.announcement_id}`));

        res.locals.announcement = result.rows[0];
        const announcementDir = path.join(__dirname, '..', '..', 'announcements', res.locals.announcement.directory);

        res.sendFile(filename, {root: announcementDir});
    });
});

module.exports = router;
