var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'WITH'
            + ' last_test_scores AS ('
            + '     SELECT'
            + '         last_value(t.id)           OVER (PARTITION BY tsc.test_instance_id ORDER BY tsc.date) AS id,'
            + '         last_value(tsc.score_perc) OVER (PARTITION BY tsc.test_instance_id ORDER BY tsc.date) AS score_perc'
            + '     FROM test_scores AS tsc'
            + '     JOIN test_instances AS ti ON (ti.id = tsc.test_instance_id)'
            + '     JOIN tests AS t ON (t.id = ti.test_id)'
            + '     JOIN users AS u ON (u.id = ti.user_id)'
            + '     JOIN enrollments AS e ON (e.user_id = u.id)'
            + '     WHERE t.course_instance_id = :courseInstanceId'
            + '     AND t.deleted_at IS NULL'
            + '     AND e.role = \'Student\''
            + ' ),'
            + ' test_stats AS ('
            + '     SELECT'
            + '         id,'
            + '         count(score_perc) AS number,'
            + '         min(score_perc) AS min,'
            + '         max(score_perc) AS max,'
            + '         round(avg(score_perc)) AS mean,'
            + '         round(stddev_samp(score_perc)) AS std,'
            + '         percentile_disc(0.5) WITHIN GROUP (ORDER BY score_perc) AS median,'
            + '         count(score_perc <= 0 OR NULL) AS n_zero,'
            + '         count(score_perc >= 100 OR NULL) AS n_hundred'
            + '     FROM last_test_scores'
            + '     GROUP BY id'
            + ' )'
            + ' SELECT'
            + '     t.*,'
            + '     tstats.*,'
            + '     ts.short_name,ts.long_name,ts.color,'
            + '     (ts.short_name || t.number) as label,'
            + '     (lag(ts.id) OVER (PARTITION BY ts.id ORDER BY t.number) IS NULL) AS start_new_set'
            + ' FROM tests AS t'
            + ' LEFT JOIN test_sets AS ts ON (ts.id = t.test_set_id)'
            + ' LEFT JOIN test_stats AS tstats ON (t.id = tstats.id)'
            + ' WHERE t.course_instance_id = :courseInstanceId'
            + ' AND t.deleted_at IS NULL'
            + ' ORDER BY (ts.number, t.number)'
            + ' ;';
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
