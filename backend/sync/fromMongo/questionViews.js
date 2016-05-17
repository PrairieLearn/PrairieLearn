var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, questionDB, callback) {
        var sql
            = ' WITH'
            + ' new_question_accesses AS ('
            + '     SELECT a.*,qiid'
            + '     FROM accesses AS a'
            + '     LEFT JOIN substring(a.path FROM \'^/qInstances\/([^/]+)\/client.js\') qiid ON true'
            + '     WHERE qiid IS NOT NULL'
            + '     AND NOT EXISTS (SELECT * FROM question_views AS qv WHERE qv.access_id = a.id)'
            + ' ),'
            + ' annotated_question_accesses AS ('
            + '     SELECT'
            + '         cta.open, cta.credit,'
            + '         qi.id AS question_instance_id,'
            + '         nqa.id AS access_id'
            + '     FROM new_question_accesses AS nqa'
            + '     JOIN question_instances AS qi ON (qi.qiid = nqa.qiid)'
            + '     JOIN test_instances AS ti ON (ti.id = qi.test_instance_id)'
            + '     JOIN tests AS t ON (t.id = ti.test_id)'
            + '     JOIN users AS u ON (u.id = ti.user_id)'
            + '     JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = t.course_instance_id)'
            + '     LEFT JOIN LATERAL check_test_access(t.id, nqa.mode, e.role, nqa.user_uid, nqa.date) cta (open,credit) ON TRUE'
            + ' )'
            + ' INSERT INTO question_views'
            + '     (question_instance_id, access_id, open, credit)'
            + '     SELECT question_instance_id, access_id, open, credit'
            + '     FROM annotated_question_accesses'
            + ' ;'
        Promise.try(function() {
            return models.sequelize.query(sql);
        }).spread(function(results, info) {
            logger.infoOverride("Synced " + info.rowCount + " question_views");
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
