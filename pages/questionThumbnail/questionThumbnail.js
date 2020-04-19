const ERR = require('async-stacktrace');
var path = require('path');
var express = require('express');
var router = express.Router();

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:id', function(req, res, _next) {
    var id = req.params['id'];
    const params = {
        course_instance_id: res.locals.course_instance ? res.locals.course_instance.id : null,
        course_id: res.locals.course.id,
        question_id: id,
    };
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, _next)) return;

        const filename = result.rows;
        if (filename.length == 0) {
            res.sendStatus(404);
            return;
        }
        var clientFilesDir = path.join(
            res.locals.course.path,
            'questions',
            filename[0].qid,
        );
        res.sendFile(filename[0].thumbnail, {maxAge: 86400000 * 30, root: clientFilesDir});
    });
});

module.exports = router;
