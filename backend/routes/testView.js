var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'SELECT tq.*,q.qid,q.title,'
            + '     z.title as zone_title,z.number as zone_number,'
            + '     (lag(z.id) OVER (PARTITION BY z.id ORDER BY tq.number) IS NULL) AS start_new_zone'
            + ' FROM test_questions AS tq'
            + ' JOIN questions AS q ON (q.id = tq.question_id)'
            + ' JOIN zones AS z ON (z.id = tq.zone_id)'
            + ' WHERE z.test_id = :testId'
            + ' ORDER BY (z.number, z.id, tq.number)'
            + ';'
        var params = {
            testId: req.locals.testId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('testView', locals);
    });
});

module.exports = router;
