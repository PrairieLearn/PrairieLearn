const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const {error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    const params = {assessment_question_id: req.params.assessment_question_id};
    sqlDb.query(sql.get_unmarked_instance_questions, params, (err, result) => {
        if (ERR(err, next)) return;
        console.log('result', result);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });

    debug('GET /');
});

module.exports = router;