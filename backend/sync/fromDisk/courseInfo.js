var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');

module.exports = {
    sync: function(courseInfo, callback) {
        logger.infoOverride("Syncing courseInfo from disk to SQL DB");
        Promise.try(function() {
            return models.Course.upsert({
                shortName: courseInfo.name,
                title: courseInfo.title,
            });
        }).then(function() {
            var course = models.Course.findOne({where: {shortName: courseInfo.name}});
            var semester = models.Semester.findOne({where: {shortName: config.semester}});
            return Promise.all([course, semester]);
        }).spread(function(course, semester) {
            if (!course) throw Error("no course where short_name = " + courseInfo.name);
            if (!semester) throw Error("no semester where short_name = " + config.semester);
            return models.CourseInstance.findOrCreate({where: {
                course_id: course.id,
                semester_id: semester.id,
            }, defaults: {}});
        }).spread(function(courseInstance, created) {
            courseInfo.courseInstanceId = courseInstance.id;
            courseInfo.courseId = courseInstance.course_id;
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
