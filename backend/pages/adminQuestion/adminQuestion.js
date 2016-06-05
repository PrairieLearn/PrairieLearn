var _ = require('underscore');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');

router.get('/', function(req, res, next) {
    var sql = 'SELECT q.*,top.name as topic_name'
        + ' FROM questions as q'
        + ' JOIN topics as top ON (top.id = q.topic_id)'
        + ' WHERE q.id = $1'
        + ' AND q.deleted_at IS NULL'
        + ';';
    var params = [req.locals.questionId];
    sqldb.query(sql, params, function(err, result) {
        if (err) {logger.error('adminQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) {logger.error('adminQuestion no results', err); return res.status(500).end();}
        var locals = _.extend({
            result: result.rows[0],
        }, req.locals);
        res.render('pages/adminQuestion/adminQuestion', locals);
    });
});

module.exports = router;
