var sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {
    sync: function(courseInfo, callback) {
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
            + '     JOIN assessment_instances AS ai ON (ai.id = qi.assessment_instance_id)'
            + '     JOIN assessments AS a ON (a.id = ai.assessment_id)'
            + '     JOIN users AS u ON (u.id = ai.user_id)'
            + '     JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = a.course_instance_id)'
            + '     LEFT JOIN LATERAL check_assessment_access(a.id, nqa.mode, e.role, nqa.user_uid, nqa.date) cta (open,credit) ON TRUE'
            + ' )'
            + ' INSERT INTO question_views'
            + '     (question_instance_id, access_id, open, credit)'
            + '     SELECT question_instance_id, access_id, open, credit'
            + '     FROM annotated_question_accesses'
            + ' ;'
        sqldb.query(sql, [], callback);
    },
};
