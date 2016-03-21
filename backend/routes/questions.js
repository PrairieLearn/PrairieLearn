var Promise = require('bluebird');
var models = require('../models');
var config = require('../config');
var _ = require('underscore');

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
    Promise.try(function() {
        var sql = 'WITH'
            + ' course_questions AS ('
            + '     SELECT q.id,q.qid,q.type,q.title,top.name AS topic_name,'
            + '     (lag(top.id) OVER (PARTITION BY top.id ORDER BY q.title) IS NULL) AS start_new_topic'
            + '     FROM questions AS q'
            + '     JOIN topics AS top ON (top.id = q.topic_id)'
            + '     WHERE q.course_id IN ('
            + '         SELECT c.id'
            + '         FROM courses AS c'
            + '         JOIN course_instances AS ci ON (c.id = ci.course_id)'
            + '         WHERE ci.id = :courseInstanceId'
            + '     )'
            + '     AND q.deleted_at IS NULL'
            + ' )'
            + ' ,'
            + ' course_tests AS ('
            + '     SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,'
            + '         ts.short_name AS test_set_short_name,ts.long_name AS test_set_long_name'
            + '     FROM tests AS t'
            + '     JOIN test_sets AS ts ON (t.test_set_id = ts.id)'
            + '     WHERE ts.course_instance_id = :courseInstanceId'
            + ' )'
            + ' SELECT q.id,q.qid,q.type,q.title,q.topic_name,q.start_new_topic,'
            + '     STRING_AGG(t.test_set_short_name || t.number,\', \''
            + '         ORDER BY (t.test_set_long_name, t.test_set_id, t.number)) AS tests'
            + ' FROM course_questions AS q'
            + ' LEFT JOIN test_questions AS tq ON (tq.question_id = q.id)'
            + ' LEFT JOIN zones AS z ON (tq.zone_id = z.id)'
            + ' LEFT JOIN course_tests as t ON (t.id = z.test_id)'
            + ' GROUP BY q.id,q.qid,q.type,q.title,q.topic_name,q.start_new_topic'
            + ' ORDER BY (q.topic_name, q.title)'
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
