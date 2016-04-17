module.exports.sql
    = ' CREATE MATERIALIZED VIEW IF NOT EXISTS user_test_durations AS'
    + ' SELECT'
    + '     u.id AS user_id,'
    + '     e.role,'
    + '     t.id AS test_id,'
    + '     max(durations.duration) AS duration'
    + ' FROM users AS u'
    + ' JOIN test_instances AS ti ON (ti.user_id = u.id)'
    + ' JOIN tests AS t ON (t.id = ti.test_id)'
    + ' JOIN test_instance_durations AS durations ON (durations.id = ti.id)'
    + ' JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = t.course_instance_id)'
    + ' WHERE t.deleted_at IS NULL'
    + ' GROUP BY u.id, t.id, e.role'
    + ' ;'

    + ' CREATE UNIQUE INDEX IF NOT EXISTS user_test_durations_idx ON user_test_durations (test_id,user_id)'
    + ' ;';
