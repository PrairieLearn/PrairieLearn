var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'WITH'
            + ' scores AS ('
            + '     SELECT MAX(tsc.score_perc) AS score'
            + '     FROM test_scores AS tsc'
            + '     JOIN test_instances AS ti ON (ti.id = tsc.test_instance_id)'
            + '     JOIN tests AS t ON (t.id = ti.test_id)'
            + '     JOIN users AS u ON (u.id = ti.user_id)'
            + '     JOIN enrollments AS e ON (e.user_id = u.id)'
            + '     WHERE t.id = :testId'
            + '     AND e.role = \'Student\''
            + '     AND tsc.score_perc IS NOT NULL'
            + '     GROUP BY u.uid,u.id'
            + '),'
            + ' hist AS ('
            + '     SELECT WIDTH_BUCKET(score,0,100,10) as bin,count(*)'
            + '     FROM scores'
            + '     GROUP BY bin'
            + ' ),'
            + ' blank_hist AS ('
            + '     SELECT *,0 AS count FROM GENERATE_SERIES(1,10) AS bin'
            + ' ),'
            + ' full_hist AS ('
            + '     SELECT * FROM hist'
            + '     UNION'
            + '     SELECT * FROM blank_hist'
            + ' ),'
            + ' clipped_hist AS ('
            + '     SELECT LEAST(10,GREATEST(1,bin)) AS bin,count'
            + '     FROM full_hist'
            + ' )'
            + ' SELECT bin,sum(count) AS count'
            + ' FROM clipped_hist'
            + ' GROUP BY bin'
            + ' ORDER BY bin'
            + ' ;'
        var params = {
            testId: req.locals.testId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('pages/testResults', locals);
    });
});

module.exports = router;
