var fs = require('fs');
var _ = require('underscore');
var async = require('async');
var moment = require('moment-timezone');
var csvStringify = require('csv').stringify;

var sqldb = require('../../sqldb');
var config = require('../../config');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, callback) {
        var that = module.exports;
        var filename = "/tmp/test_instances.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT tiid FROM test_instances;'
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).each(function(row) {
                existingIds[row.tiid] = true;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.tiCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                cursor.count(function(err, nObj) {
                    if (err) return callback(err);
                    var i = 0;
                    (function handle() {
                        cursor.next(function(err, obj) {
                            if (err) return callback(err);
                            if (obj == null) {
                                fs.close(fd, function(err) {
                                    if (err) return callback(err);
                                    return callback(null);
                                });
                                return;
                            }
                            i++;
                            var iterate = function() {
                                if (i % 1000 == 0) {
                                    setTimeout(handle, 0);
                                } else {
                                    handle();
                                }
                            };
                            if (existingIds[obj.tiid]) {
                                // already have this object in the SQL DB
                                iterate();
                            } else {
                                // don't have this object yet in SQL DB, write it to the CSV file
                                csvData = [[
                                    moment(obj.date).tz(config.timezone).format(),
                                    obj.uid,
                                    obj.tid,
                                    obj.tiid,
                                    obj.number,
                                    obj.score,
                                    obj.scorePerc,
                                    obj.finishDate,
                                    JSON.stringify(obj.gradingDates),
                                ]];
                                csvStringify(csvData, function(err, csv) {
                                    fs.write(fd, csv, function(err) {
                                        if (err) return callback(err);
                                        iterate();
                                    });
                                });
                            }
                        })
                    })();
                });
            });
        });
    },

    fileToSQL: function(filename, callback) {

        var sql
            = ' drop table if exists test_instances_import;'
            + ' create table test_instances_import ('
            + '     date timestamp with time zone,'
            + '     uid varchar(255),'
            + '     tid varchar(255),'
            + '     tiid varchar(255),'
            + '     number integer,'
            + '     score double precision,'
            + '     score_perc integer,'
            + '     finish_date timestamp with time zone,'
            + '     grading_dates JSONB'
            + ' );'
            + ' COPY test_instances_import (date, uid, tid, tiid, number, score, score_perc, finish_date, grading_dates)'
            + ' FROM \'/tmp/test_instances.csv\' WITH (FORMAT CSV);'
            + ' INSERT INTO test_instances (tiid, date, number, test_id, user_id, auth_user_id)'
            + ' ('
            + '     SELECT tii.tiid, tii.date, tii.number, t.id, u.id, u.id'
            + '     FROM test_instances_import AS tii'
            + '     LEFT JOIN users AS u ON (u.uid = tii.uid)'
            + '     LEFT JOIN ('
            + '         SELECT t.id,t.tid,ci.course_id'
            + '         FROM tests AS t'
            + '         JOIN course_instances AS ci ON (ci.id = t.course_instance_id)'
            + '     ) AS t ON (t.tid = tii.tid AND t.course_id = 1)'
            + ' )'
            + ' ON CONFLICT DO NOTHING;'
        sqldb.query(sql, [], callback);
    },






    


    oldSync: function(courseInfo, testDB, callback) {
        var that = module.exports;
        // find all the testInstances in mongo
        db.tiCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.toArray(function(err, objs) {
                if (err) return callback(err);
                // only process tInstances for tests that we have on disk
                objs = _(objs).filter(function(o) {return _(testDB).has(o.tid);});
                async.eachSeries(objs, function(ti, callback) {
                    var user, test;
                    Promise.try(function() {
                        return models.User.findOne({where: {
                            uid: ti.uid,
                        }});
                    }).then(function(findUser) {
                        user = findUser;
                        if (!user) throw Error("no user where uid = " + ti.uid);
                        return models.CourseInstance.findAll({where: {
                            courseId: courseInfo.courseId,
                        }});
                    }).then(function(courseInstances) {
                        if (courseInstances.length === 0) throw Error('no course instances with course_id = ' + courseInfo.courseId);
                        return models.Test.findOne({where: {
                            tid: ti.tid,
                            courseInstanceId: {
                                $in: _(courseInstances).pluck('id'),
                            }
                        }});
                    }).then(function(findTest) {
                        test = findTest;
                        if (!test) throw Error("no test where tid = " + ti.tid + " and course_instance_id in " + _(courseInstances).pluck('id'));
                        return models.TestInstance.findOne({where: {
                            userId: user.id,
                            testId: test.id,
                            number: ti.number,
                            tiid: {
                                $ne: ti.tiid,
                            },
                        }});
                    }).then(function(findTestInstance) {
                        if (findTestInstance) {
                            logger.warn('Duplicate test instances with:'
                                        + ' uid = ' + user.uid
                                        + ', tid = ' + test.tid
                                        + ', number = ' + ti.number
                                        + ' (tiids = ' + findTestInstance.tiid
                                        + ', ' + ti.tiid + ')'
                                        + ', discarding second instance');
                            return Promise.resolve();
                        }
                        var testInstance;
                        return Promise.try(function() {
                            return models.TestInstance.findOrCreate({where: {
                                tiid: ti.tiid,
                            }});
                        }).spread(function(newTestInstance, created) {
                            testInstance = newTestInstance;
                            return testInstance.update({
                                date: ti.date,
                                number: ti.number,
                                userId: user.id,
                                testId: test.id,
                                authUserId: user.id,
                            });
                        }).then(function() {
                            return that.syncTestStates(testInstance, ti, user);
                        }).then(function() {
                            return that.syncTestScores(testInstance, ti, user, test);
                        });
                    }).then(function() {
                        callback(null);
                    }).catch(function(err) {
                        callback(err);
                    });
                }, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    },

    syncTestStates: function(testInstance, ti, user) {
        return Promise.try(function() {
            // test was opened at creation time
            return models.TestState.findOrCreate({where: {
                testInstanceId: testInstance.id,
                open: true,
            }, defaults: {
                date: ti.date,
                authUserId: user.id,
            }});
        }).then(function() {
            // record closing, if any
            if (!_(ti).has('finishDate')) return Promise.resolve();
            return models.TestState.findOrCreate({where: {
                testInstanceId: testInstance.id,
                open: false,
            }, defaults: {
                date: ti.finishDate,
                authUserId: user.id,
            }});
        });
    },

    syncTestScores: function(testInstance, ti, user, test) {
        if (test.type == 'Exam') {
            if (!_(ti).has('score')) return Promise.resolve();
            return models.TestScore.findOrCreate({where: {
                testInstanceId: testInstance.id,
            }, defaults: {
                date: ti.finishDate,
                points: ti.score,
                maxPoints: test.maxScore,
                scorePerc: ti.scorePerc,
                authUserId: user.id,
            }});
        } else if (test.type == 'RetryExam') {
            return Promise.all(_(ti.gradingDates).map(function(d, i) {
                return models.TestScore.findOrCreate({where: {
                    testInstanceId: testInstance.id,
                    date: d,
                }, defaults: {
                    authUserId: user.id,
                    maxPoints: test.maxScore,
                    points: ((i < ti.gradingDates.length - 1) ? 0 : ti.score),
                    scorePerc: ((i < ti.gradingDates.length - 1) ? 0 : ti.scorePerc),
                }});
            }));
        } else if (test.type == 'Basic' || test.type == 'Game') {
            return models.TestScore.findOrCreate({where: {
                testInstanceId: testInstance.id,
            }, defaults: {
                date: null, // will be set in submissions sync
                points: ti.score,
                maxPoints: test.maxScore,
                scorePerc: (_(ti).has('scorePerc') ? ti.scorePerc
                            : (_(test).has('maxScore') ? Math.floor(ti.score / test.maxScore * 100) : 0)),
                authUserId: user.id,
            }});
        } else {
            throw Error('unknown test.type');
        }
    },
};
