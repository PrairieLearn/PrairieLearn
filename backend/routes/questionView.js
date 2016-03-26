var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT q.*,top.name as topic_name'
            + ' FROM questions as q'
            + ' JOIN topics as top ON (top.id = q.topic_id)'
            + ' WHERE q.id = :questionId'
            + ' AND q.deleted_at IS NULL'
            + ';'
        var params = {
            questionId: req.locals.questionId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        if (results.length != 1) {
            throw Error("no valid question with id = " + req.locals.questionId);
        }
        var locals = _.extend({
            result: results[0],
        }, req.locals);
        res.render('pages/questionView', locals);
    });
});

module.exports = router;
