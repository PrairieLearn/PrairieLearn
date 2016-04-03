var _ = require('underscore');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');

module.exports = {
    sync: function(courseInfo) {
        return Promise.try(function() {
            return models.Course.upsert({
                shortName: courseInfo.name,
                title: courseInfo.title,
            });
        }).then(function() {
            var course = models.Course.findOne({where: {shortName: courseInfo.name}});
            var semesters = models.Semester.findAll();
            return Promise.all([course, semesters]);
        }).spread(function(course, semesters) {
            if (!course) throw Error("can't find course");
            /*
              FIXME: For now we create a course instance for every semester, even if
              this course wasn't actually in all semesters.
            */
            return Promise.all(
                _(semesters).map(function(semester) {
                    return models.CourseInstance.findOrCreate({where: {
                        courseId: course.id,
                        semesterId: semester.id,
                    }}).spread(function(courseInstance, created) {
                        courseInfo.courseId = courseInstance.courseId;
                    });
                })
            );
        }).then(function() {
            return models.Semester.findOne({where: {
                shortName: config.defaultSemester,
            }});
        }).then(function(semester) {
            if (!semester) throw Error("can't find semester");
            courseInfo.semesterId = semester.id;
            return models.CourseInstance.findOne({where: {
                courseId: courseInfo.courseId,
                semesterId: courseInfo.semesterId,
            }});
        }).then(function(courseInstance) {
            if (!courseInstance) throw Error("can't find courseInstance");
            courseInfo.courseInstanceId = courseInstance.id;
        });
    },
};
