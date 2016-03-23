var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT tq.*,q.qid,q.type,q.title,top.name as topic_name'
            + ' FROM test_questions AS tq'
            + ' JOIN questions AS q ON (q.id = tq.question_id)'
            + ' JOIN topics AS top ON (top.id = q.topic_id)'
            + ' WHERE tq.id = :testQuestionId'
            + ';'
        var params = {
            testQuestionId: req.locals.testQuestionId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no valid test question with id = " + req.locals.testQuestionId);
        }
        var locals = _.extend({
            result: results[0],
        }, req.locals);
        res.render('testQuestionView', locals);
    });
});

module.exports = router;
