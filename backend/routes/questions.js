var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT q.id,q.qid,q.type,q.title'
            + ' FROM questions as q'
            + ' WHERE q.course_id IN ('
            + '     SELECT c.id'
            + '     FROM courses AS c'
            + '     JOIN course_instances AS ci ON (c.id = ci.course_id)'
            + '     WHERE ci.id = :courseInstanceId'
            + ' )'
            + ' AND q.deleted_at IS NULL'
            + ';'
        var params = {
            courseInstanceId: req.locals.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('questions', locals);
    });
});

module.exports = router;
