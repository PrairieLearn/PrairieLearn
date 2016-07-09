var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'adminQuestion.sql'));

router.get('/', function(req, res, next) {
    var params = [req.locals.questionId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) {logger.error('adminQuestion query failed', err); return res.status(500).end();}
        if (result.rowCount !== 1) {logger.error('adminQuestion no results', err); return res.status(500).end();}

        question.makeQuestionInstance(req.locals.question, req.locals.course, function(err, questionInstance) {
            if (err) {logger.error('error making question', err); return res.status(500).end();}
            question.getModule(req.locals.question.type, function(err, questionModule) {
                if (err) {logger.error('error getting question module', err); return res.status(500).end();}
                questionModule.renderQuestion(req.locals.questionInstance, req.locals.question, null, req.locals.course, function(err, questionHtml) {
                    if (err) {logger.error('error rendering question', err); return res.status(500).end();}
                    
                    var locals = _.extend({
                        result: result.rows[0],
                        questionHtml: questionHtml,
                    }, req.locals);
                    res.render(path.join(__dirname, 'adminQuestion'), locals);
                });
            });
        });
    });
});

module.exports = router;
