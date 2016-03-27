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
            + ' course_instance_tests AS ('
            + '     SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,ts.color,'
            + '         ts.short_name AS test_set_short_name,ts.long_name AS test_set_long_name'
            + '     FROM tests AS t'
            + '     JOIN test_sets AS ts ON (t.test_set_id = ts.id)'
            + '     WHERE ts.course_instance_id = :courseInstanceId'
            + '     AND t.deleted_at IS NULL'
            + ' )'
            + ' SELECT q.id,q.qid,q.type,q.title,q.topic_name,q.start_new_topic,'
            + '     JSONB_AGG(JSONB_BUILD_OBJECT('
            + '             \'label\',t.test_set_short_name || t.number,'
            + '             \'test_id\',t.id,'
            + '             \'color\',t.color)'
            + '           ORDER BY (t.test_set_long_name, t.test_set_id, t.number))'
            + '       FILTER (WHERE t.test_set_id IS NOT NULL)'
            + '       AS tests'
            + ' FROM course_questions AS q'
            + ' LEFT JOIN ('
            + '     test_questions AS tq'
            + '     JOIN course_instance_tests as t ON (t.id = tq.test_id)'
            + ' ) ON (tq.question_id = q.id)'
            + ' WHERE tq.deleted_at IS NULL'
            + ' GROUP BY q.id,q.qid,q.type,q.title,q.topic_name,q.start_new_topic'
            + ' ORDER BY (q.topic_name, q.title)'
            + ';';
        var params = {
            courseInstanceId: req.locals.courseInstanceId,
        };
        return models.sequelize.query(sql, {replacements: params});
    }).spread(function(results, info) {
        var locals = _.extend({
            results: results,
        }, req.locals);
        res.render('pages/questions', locals);
    });
});

module.exports = router;
