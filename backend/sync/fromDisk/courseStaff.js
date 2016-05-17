var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');
var requireFrontend = require("../../require-frontend");
var PrairieRole = requireFrontend('PrairieRole');

var models = require('../../models');
var config = require('../../config');

var upsertEnrollmentsToCourseSQL
    = ' INSERT INTO enrollments'
    + ' (role,user_id,course_instance_id)'
    + ' ('
    + '     SELECT nu.role,nu.user_id,ci.id'
    + '     FROM course_instances AS ci,'
    + '     (VALUES (:userId,:role::enum_role))'
    + '     AS nu (user_id,role)'
    + '     WHERE course_id = :courseId'
    + ' )'
    + ' ON CONFLICT (user_id,course_instance_id)'
    + ' DO UPDATE SET role = EXCLUDED.role'
    + ' WHERE EXCLUDED.role != enrollments.role'
    + ' ;';

module.exports = {
    sync: function(courseInfo) {
        var superuserUIDs = [];
        var instructorUIDs = [];
        var taUIDs = [];
        return Promise.try(function() {
            // load all Superusers from config.roles
            return Promise.all(_(config.roles).map(function(role, uid) {
                if (role !== "Superuser") return Promise.resolve(null);
                superuserUIDs.push(uid);
                // Superusers get enrolled in all courseInstances of the course
                return models.User.findOrCreate({where: {
                    uid: uid,
                }}).spread(function(user, created) {
                    var params = {
                        userId: user.id,
                        role: 'Superuser',
                        courseId: courseInfo.courseId,
                    };
                    return models.sequelize.query(upsertEnrollmentsToCourseSQL, {replacements: params});
                });
            }));
        }).then(function() {
            // load Instructors and TAs from courseInfo
            return Promise.all(_(courseInfo.userRoles || []).map(function(role, uid) {
                if (role !== "Instructor" && role != "TA") return Promise.resolve(null);
                return models.User.findOrCreate({where: {
                    uid: uid,
                }}).spread(function(user, created) {
                    if (role == "Instructor") {
                        instructorUIDs.push(uid);
                        // Instructors get enrolled in all courseInstances of the course
                        var params = {
                            userId: user.id,
                            role: 'Instructor',
                            courseId: courseInfo.courseId,
                        };
                        return models.sequelize.query(upsertEnrollmentsToCourseSQL, {replacements: params});
                    } else if (role == "TA") {
                        taUIDs.push(uid);
                        // TAs only get enrolled in the current courseInstance
                        var sql
                            = ' INSERT INTO enrollments'
                            + ' (role,user_id,course_instance_id)'
                            + ' VALUES (\'TA\', $userId, $courseInstanceId)'
                            + ' ON CONFLICT (user_id,course_instance_id)'
                            + ' DO UPDATE SET role = EXCLUDED.role'
                            + ' ;';
                        var params = {
                            userId: user.id,
                            courseInstanceId: courseInfo.courseInstanceId,
                        };
                        return models.sequelize.query(sql, {bind: params});
                    } else {
                        throw Error("invalid role: " + role);
                    }
                });
            }));
        }).then(function() {
            // reduce Superuser/Instructors to Students in the current course if they are not in the above list
            var siUIDs = _.union(superuserUIDs, instructorUIDs);
            var sql = 'UPDATE enrollments SET role = \'Student\''
                + ' WHERE EXISTS('
                + '     SELECT * FROM enrollments AS e'
                + '     JOIN users AS u ON (u.id = e.user_id)'
                + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                + '     JOIN courses AS c ON (c.id = ci.course_id)'
                + '     WHERE e.id = enrollments.id'
                + '     AND c.id = :courseId'
                + '     AND e.role IN (\'Superuser\'::enum_role, \'Instructor\'::enum_role)'
                + '     AND ' + (siUIDs.length === 0 ? 'TRUE' : 'u.uid NOT IN (:siUIDs)')
                + ' )'
                + ' ;';
            var params = {
                siUIDs: siUIDs,
                courseId: courseInfo.courseId,
            };
            return models.sequelize.query(sql, {replacements: params});
        }).then(function() {
            // reduce TAs to Students in the current course if they are not in the above list or not in the current courseInstance
            var sql = 'UPDATE enrollments SET role = \'Student\''
                + ' WHERE EXISTS('
                + '     SELECT * FROM enrollments AS e'
                + '     JOIN users AS u ON (u.id = e.user_id)'
                + '     JOIN course_instances AS ci ON (ci.id = e.course_instance_id)'
                + '     JOIN courses AS c ON (c.id = ci.course_id)'
                + '     WHERE e.id = enrollments.id'
                + '     AND c.id = :courseId'
                + '     AND e.role = \'TA\'::enum_role'
                + '     AND ('
                + '         ci.id != :courseInstanceId'
                + '     OR ' + (taUIDs.length === 0 ? 'TRUE' : 'u.uid NOT IN (:taUIDs)')
                + '     )'
                + ' )'
                + ' ;';
            var params = {
                taUIDs: taUIDs,
                courseId: courseInfo.courseId,
                courseInstanceId: courseInfo.courseInstanceId,
            };
            return models.sequelize.query(sql, {replacements: params});
        });
    },
};
