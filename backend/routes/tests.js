var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT t.id,t.tid,t.type,t.number,t.title,ts.short_name,ts.long_name,ts.color,'
            + ' (ts.short_name || t.number) as label,'
            + ' (lag(ts.id) OVER (PARTITION BY ts.id ORDER BY t.number) IS NULL) AS start_new_set'
            + ' FROM tests AS t LEFT JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
            + ' WHERE t.course_instance_id = :courseInstanceId'
            + ' AND t.deleted_at IS NULL'
            + ' ORDER BY (ts.long_name, ts.id, t.number)'
            + ';'
        var params = {
            courseInstanceId: req.locals.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('pages/tests', locals);
    });
});

module.exports = router;
