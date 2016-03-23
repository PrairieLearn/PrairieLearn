var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'WITH'
            + ' test_questions_list AS ('
            + '     SELECT tq.*,q.qid,q.title,top.name AS topic_name,'
            + '         z.title AS zone_title,z.number AS zone_number,'
            + '         (lag(z.id) OVER (PARTITION BY z.id ORDER BY tq.number) IS NULL) AS start_new_zone'
            + '     FROM test_questions AS tq'
            + '     JOIN questions AS q ON (q.id = tq.question_id)'
            + '     JOIN zones AS z ON (z.id = tq.zone_id)'
            + '     JOIN topics AS top ON (top.id = q.topic_id)'
            + '     WHERE z.test_id = :testId'
            + '     ORDER BY (z.number, z.id, tq.number)'
            + ' )'
            + ' ,'
            + ' course_tests AS ('
            + '     SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,ts.color,'
            + '         ts.short_name AS test_set_short_name,ts.long_name AS test_set_long_name'
            + '     FROM tests AS t'
            + '     JOIN test_sets AS ts ON (t.test_set_id = ts.id)'
            + '     WHERE ts.course_instance_id = :courseInstanceId'
            + ' )'
            + ' ,'
            + ' test_lists AS ('
            + '     SELECT tql.id,'
            + '         JSONB_AGG(JSONB_BUILD_OBJECT('
            + '                 \'label\',t.test_set_short_name || t.number,'
            + '                 \'test_id\',t.id,'
            + '                 \'color\',t.color)'
            + '               ORDER BY (t.test_set_long_name, t.test_set_id, t.number))'
            + '           FILTER ('
            + '               WHERE t.test_set_id IS NOT NULL'
            + '               AND t.id != :testId'
            + '           )'
            + '           AS tests'
            + '     FROM test_questions_list AS tql'
            + '     LEFT JOIN ('
            + '         test_questions AS tq'
            + '         JOIN zones AS z ON (tq.zone_id = z.id)'
            + '         JOIN course_tests as t ON (t.id = z.test_id)'
            + '     ) ON (tq.question_id = tql.question_id)'
            + '     GROUP BY tql.id,tql.question_id'
            + ' )'
            + ' SELECT tql.*,tl.tests'
            + ' FROM test_questions_list AS tql'
            + ' LEFT JOIN test_lists AS tl ON (tql.id = tl.id)'
            + ' ORDER BY (tql.zone_number, tql.zone_id, tql.number)'
            + ';'
        var params = {
            testId: req.locals.testId,
            courseInstanceId: req.locals.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('pages/testView', locals);
    });
});

module.exports = router;
