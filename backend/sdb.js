var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var Promise = require('bluebird');
var models = require('./models');

var config = require('./config');
var logger = require('./logger');

module.exports = {
    init: function(callback) {
        models.sequelize.sync().then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initSemesters: function(callback) {
        models.Semester.upsert({
            shortName: 'Fa15',
            longName: 'Fall 2015',
            startDate: moment.tz('2015-08-24T00:00:01', config.timezone).format(),
            endDate: moment.tz('2016-12-18T23:59:59', config.timezone).format(),
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Sp16',
                longName: 'Spring 2016',
                startDate: moment.tz('2016-01-19T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-05-13T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return models.Semester.upsert({
                shortName: 'Su16',
                longName: 'Summer 2016',
                startDate: moment.tz('2016-06-13T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-08-06T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initCourseInfo: function(courseInfo, callback) {
        var upsertCourse = models.Course.upsert({shortName: courseInfo.name, title: courseInfo.title});
        var course = models.Course.findOne({where: {shortName: courseInfo.name}});
        var semester = models.Semester.findOne({where: {shortName: config.semester}});
        Promise.join(upsertCourse, course, semester, function(courseCreated, course, semester) {
            return models.CourseInstance.findOrCreate({where: {
                course_id: course.id,
                semester_id: semester.id,
            }, defaults: {}});
        }).spread(function(courseInstance, created) {
            courseInfo.courseInstanceId = courseInstance.id;
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },
};
