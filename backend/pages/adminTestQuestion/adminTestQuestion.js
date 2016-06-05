var _ = require('underscore');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');

router.get('/', function(req, res, next) {
    var sql = 'SELECT tq.*,q.qid,q.type,q.title,top.name as topic_name'
        + ' FROM test_questions AS tq'
        + ' JOIN questions AS q ON (q.id = tq.question_id)'
        + ' JOIN topics AS top ON (top.id = q.topic_id)'
        + ' WHERE tq.id = $1'
        + ' AND tq.deleted_at IS NULL'
        + ' AND q.deleted_at IS NULL'
        + ';';
    var params = [req.locals.testQuestionId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('adminTestQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) {logger.error('adminTestQuestion no results', err); return res.status(500).end();}
        var locals = _.extend({
            result: result.rows[0],
        }, req.locals);
        res.render('pages/adminTestQuestion/adminTestQuestion', locals);
    });
});

module.exports = router;
