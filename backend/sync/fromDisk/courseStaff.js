var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');
var requirejs = require('requirejs');
var PrairieRole = requirejs('PrairieRole');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');

var upsertEnrollmentsToCourseSQL
    = ' INSERT INTO enrollments'
    + ' (role,user_id,course_instance_id,created_at,updated_at)'
    + ' ('
    + '     SELECT nu.role,nu.user_id,ci.id,nu.created_at,nu.updated_at'
    + '     FROM course_instances AS ci,'
    + '     (VALUES (:user_id,:role::enum_enrollments_role,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP))'
    + '     AS nu (user_id,role,created_at,updated_at)'
    + '     WHERE course_id = :course_id'
    + '     AND deleted_at IS NULL'
    + ' )'
    + ' ON CONFLICT (user_id,course_instance_id)'
    + ' DO UPDATE SET (role,updated_at) = (EXCLUDED.role,EXCLUDED.updated_at)'
    + ' WHERE EXCLUDED.role != enrollments.role'
    + ' ;';

module.exports = {
    sync: function(courseInfo, callback) {
        logger.infoOverride("Syncing course staff from disk to SQL DB");
        var superuserUIDs = [];
        var instructorUIDs = [];
        var taUIDs = [];
        Promise.try(function() {
            // load all Superusers from config.roles
            return Promise.all(_(config.roles).map(function(role, uid) {
                if (role != "Superuser") return Promise.resolve(null);
                superuserUIDs.push(uid);
                // Superusers get enrolled in all courseInstances of the course
                return models.User.findOrCreate({where: {
                    uid: uid,
                }}).spread(function(user, created) {
                    var params = {
                        user_id: user.id,
                        role: 'Superuser',
                        course_id: courseInfo.courseId,
                    };
                    return models.sequelize.query(upsertEnrollmentsToCourseSQL, {replacements: params});
                });
            }));
        }).then(function() {
            // load Instructors and TAs from courseInfo
            return Promise.all(_(courseInfo.userRoles || []).map(function(role, uid) {
                if (role != "Instructor" && role != "TA") return Promise.resolve(null);
                return models.User.findOrCreate({where: {
                    uid: uid,
                }}).spread(function(user, created) {
                    if (role == "Instructor") {
                        instructorUIDs.push(uid);
                        // Instructors get enrolled in all courseInstances of the course
                        var params = {
                            user_id: user.id,
                            role: 'Instructor',
                            course_id: courseInfo.courseId,
                        };
                        return models.sequelize.query(upsertEnrollmentsToCourseSQL, {replacements: params});
                    } else if (role == "TA") {
                        taUIDs.push(uid);
                        // TAs only get enrolled in the current courseInstance
                        return models.Enrollment.upsert({
                            user_id: user.id,
                            course_instance_id: courseInfo.courseInstanceId,
                            role: role,
                        });
                    } else {
                        throw Error("invalid role: " + role);
                    }
                });
            }));
        }).then(function() {
            // reduce Superuser/Instructors to Students in the current course if they are not in the above list
            var siUIDs = _.union(superuserUIDs, instructorUIDs);
            if (siUIDs.length == 0) return Promise.resolve(null);
            var sql = 'UPDATE enrollments SET role = \'Student\''
                + ' WHERE EXISTS('
                + '     SELECT * FROM enrollments AS e'
                + '     JOIN users AS u ON (u.id = e.user_id)'
                + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                + '     JOIN courses AS c ON (c.id = ci.course_id)'
                + '     WHERE e.id = enrollments.id'
                + '     AND c.id = :courseId'
                + '     AND e.role IN (\'Superuser\'::enum_enrollments_role, \'Instructor\'::enum_enrollments_role)'
                + '     AND u.uid NOT IN (:siUIDs)'
                + ' )'
                + ' ;';
            var params = {
                siUIDs: siUIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        }).then(function() {
            // reduce TAs to Students in the current course if they are not in the above list or not in the current courseInstance
            var uids = _.union(superuserUIDs, instructorUIDs);
            if (uids.length == 0) return Promise.resolve(null);
            var sql = 'UPDATE enrollments SET role = \'Student\''
                + ' WHERE EXISTS('
                + '     SELECT * FROM enrollments AS e'
                + '     JOIN users AS u ON (u.id = e.user_id)'
                + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                + '     JOIN courses AS c ON (c.id = ci.course_id)'
                + '     WHERE e.id = enrollments.id'
                + '     AND c.id = :courseId'
                + '     AND e.role = \'TA\'::enum_enrollments_role'
                + '     AND ('
                + '         u.uid NOT IN (:taUIDs)'
                + '         OR ci.id != :courseInstanceId'
                + '     )'
                + ' )'
                + ' ;';
            var params = {
                taUIDs: taUIDs,
                courseId: courseInfo.courseId,
                courseInstanceId: courseInfo.courseInstanceId,
            };
            return models.sequelize.query(sql, {replacements: params});
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
