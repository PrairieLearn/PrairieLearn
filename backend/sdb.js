var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var Promise = require('bluebird');
var pg = require('pg');
var Sequelize = require('sequelize');

var config = require('./config');
var logger = require('./logger');

var sequelize = new Sequelize(config.sdbAddress, {
    define: {
        underscored: true,
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
    },
});

var Semester = sequelize.define('semester', {
    shortName: {type: Sequelize.STRING, unique: true},
    longName: Sequelize.STRING,
    startDate: Sequelize.DATE,
    endDate: Sequelize.DATE,
});

var Course = sequelize.define('course', {
    shortName: {type: Sequelize.STRING, unique: true},
    title: Sequelize.STRING,
});

var CourseInstance = sequelize.define('course_instance', {
});

CourseInstance.belongsTo(Course);
CourseInstance.belongsTo(Semester);

module.exports = {
    init: function(callback) {
        sequelize.sync().then(function() {
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },

    initSemesters: function(callback) {
        Semester.upsert({
            shortName: 'Fa15',
            longName: 'Fall 2015',
            startDate: moment.tz('2015-08-24T00:00:01', config.timezone).format(),
            endDate: moment.tz('2016-12-18T23:59:59', config.timezone).format(),
        }).then(function() {
            return Semester.upsert({
                shortName: 'Sp16',
                longName: 'Spring 2016',
                startDate: moment.tz('2016-01-19T00:00:01', config.timezone).format(),
                endDate: moment.tz('2016-05-13T23:59:59', config.timezone).format(),
            });
        }).then(function() {
            return Semester.upsert({
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
        var upsertCourse = Course.upsert({shortName: courseInfo.name, title: courseInfo.title});
        var course = Course.findOne({where: {shortName: courseInfo.name}});
        var semester = Semester.findOne({where: {shortName: config.semester}});
        Promise.join(upsertCourse, course, semester, function(courseCreated, course, semester) {
            return CourseInstance.findOrCreate({where: {
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
