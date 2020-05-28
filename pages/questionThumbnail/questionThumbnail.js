const ERR = require('async-stacktrace');
var path = require('path');
var express = require('express');
var router = express.Router();

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:id/:filename', function(req, res, _next) {
    var id = req.params['id'];
    var filename = req.params['filename'];
    const params = {
        course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
        course_id: res.locals.course.id,
        question_id: id,
    };
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, _next)) return;

        const qinfo = result.rows;
        if (qinfo.length == 0) {
            res.sendStatus(404);
            return;
        }
        var clientFilesDir = path.join(
            res.locals.course.path,
            'questions',
            qinfo[0].qid,
        );
        res.sendFile(filename, {maxAge: 86400000 * 30, root: clientFilesDir});
    });
});

module.exports = router;
