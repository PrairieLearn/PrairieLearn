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
        var filename = "/tmp/submissions.csv";
        that.readExistingIds(function(err, existingIds) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, existingIds, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, callback);
            });
        });
    },
        
    readExistingIds: function(callback) {
        var sql = 'SELECT sid FROM submissions;';
        sqldb.query(sql, [], function(err, result) {
            if (err) return callback(err);
            var existingIds = {};
            _(result.rows).each(function(row) {
                existingIds[row.sid] = true;
            });
            callback(null, existingIds);
        });
    },

    mongoToFile: function(filename, courseInfo, existingIds, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.sCollect.find({}, function(err, cursor) {
                if (err) return callback(err);
                var done = false;
                async.doUntil(function(callback) {
                    cursor.next(function(err, obj) {
                        if (err) return callback(err);
                        if (obj == null) {
                            done = true;
                            return callback(null);
                        }
                        if (existingIds[obj.sid]) {
                            // already have this object in the SQL DB, skip it
                            return callback(null);
                        }
                        csvData = [[
                            obj.sid,
                            moment(obj.date).tz(config.timezone).format(),
                            obj.uid,
                            obj.qiid,
                            obj.score,
                            obj.overrideScore,
                            (obj.practice ? 'practice' : 'score'),
                            (obj.feedback ? JSON.stringify(obj.feedback).replace(/\\u0000/g, '') : ''),
                            (obj.submittedAnswer ? JSON.stringify(obj.submittedAnswer).replace(/\\u0000/g, '') : ''),
                        ]];
                        csvStringify(csvData, function(err, csv) {
                            if (err) return callback(err);
                            fs.write(fd, csv, callback);
                        });
                    });
                }, function() {return done;}, callback);
            });
        });
    },

    fileToSQL: function(filename, callback) {
        // load import data into a temporary table
        var sql
            = ' DROP TABLE IF EXISTS submissions_import;'
            + ' CREATE TABLE submissions_import ('
            + '     sid VARCHAR(255),'
            + '     date TIMESTAMP WITH TIME ZONE,'
            + '     uid VARCHAR(255),'
            + '     qiid VARCHAR(255),'
            + '     score DOUBLE PRECISION,'
            + '     override_score DOUBLE PRECISION,'
            + '     type enum_submission_type,'
            + '     feedback JSONB,'
            + '     submitted_answer JSONB'
            + ' );'
            + ' COPY submissions_import (sid, date, uid, qiid, score, override_score, type, feedback, submitted_answer)'
            + ' FROM \'' + filename + '\' WITH (FORMAT CSV);';
        sqldb.query(sql, [], function(err) {
            if (err) return callback(err);
            // create new submissions from imported data
            var sql
                = ' INSERT INTO submissions (sid, date, question_instance_id, auth_user_id, submitted_answer, type,'
                + '                          override_score, open, credit, mode)'
                + ' ('
                + '     SELECT si.sid, si.date, qi.id, u.id, si.submitted_answer, si.type, si.override_score, NULL, NULL, NULL'
                + '     FROM submissions_import AS si'
                + '     JOIN users AS u ON (u.uid = si.uid)'
                + '     JOIN question_instances AS qi ON (qi.qiid = si.qiid)'
                + ' )'
                + ' ON CONFLICT DO NOTHING;';
            sqldb.query(sql, [], function(err) {
                if (err) return callback(err);
                // create new gradings from imported data
                var sql
                    = ' INSERT INTO gradings (date, submission_id, auth_user_id, score, feedback)'
                    + ' ('
                    + '     SELECT si.date, s.id, u.id, si.score, si.feedback'
                    + '     FROM submissions_import AS si'
                    + '     JOIN submissions AS s ON (s.sid = si.sid)'
                    + '     JOIN users AS u ON (u.uid = si.uid)'
                    + ' )'
                    + ' ON CONFLICT DO NOTHING;';
                sqldb.query(sql, [], function(err) {
                    if (err) return callback(err);
                    // create new question scores from imported data
                    var sql
                        = " INSERT INTO question_scores (date, grading_id, question_instance_id, test_score_id, auth_user_id,"
                        + "                              points, max_points)"
                        + " ("
                        + "     SELECT si.date, g.id, qi.id, ts.id, u.id,"
                        + "            CASE"
                        + "                WHEN t.type = 'Exam' AND g.score >= 0.5"
                        + "                    THEN 1"
                        + "                WHEN t.type = 'Exam' AND g.score < 0.5"
                        + "                    THEN 0"
                        + "                WHEN t.type = 'RetryExam'"
                        + "                    THEN jsonb_extract_path_text(ti.obj, 'questionsByQID', q.qid, 'awardedPoints')::DOUBLE PRECISION"
                        + "                WHEN t.type = 'Game'"
                        + "                    THEN jsonb_extract_path_text(ti.obj, 'qData', q.qid, 'score')::DOUBLE PRECISION"
                        + "                WHEN t.type = 'Basic'"
                        + "                    THEN jsonb_extract_path_text(ti.obj, 'qData', q.qid, 'avgScore')::DOUBLE PRECISION"
                        + "            END,"
                        + "            CASE"
                        + "                WHEN t.type = 'Exam'"
                        + "                    THEN 1"
                        + "                WHEN t.type = 'RetryExam'"
                        + "                    THEN jsonb_extract_path_text(ti.obj, 'questionsByQID', q.qid, 'points', '0')::DOUBLE PRECISION"
                        + "                WHEN t.type = 'Game'"
                        + "                    THEN jsonb_extract_path_text(t.obj, 'qParams', q.qid, 'maxScore')::DOUBLE PRECISION"
                        + "                WHEN t.type = 'Basic'"
                        + "                    THEN 1"
                        + "            END"
                        + "     FROM submissions_import AS si"
                        + "     JOIN submissions AS s ON (s.sid = si.sid)"
                        + "     JOIN gradings AS g ON (g.submission_id = s.id)"
                        + "     JOIN users AS u ON (u.uid = si.uid)"
                        + "     JOIN question_instances AS qi ON (qi.id = s.question_instance_id)"
                        + "     JOIN test_instances AS ti ON (ti.id = qi.test_instance_id)"
                        + "     JOIN test_questions AS tq ON (tq.id = qi.test_question_id)"
                        + "     JOIN questions AS q ON (q.id = tq.question_id)"
                        + "     JOIN tests AS t ON (t.id = tq.test_id)"
                        + "     JOIN ("
                        + "         SELECT DISTINCT ON (test_instance_id) *"
                        + "         FROM test_scores"
                        + "         ORDER BY test_instance_id, date DESC, id"
                        + "     ) AS ts ON (ts.test_instance_id = ti.id)"
                        + " )"
                        + " ON CONFLICT DO NOTHING;";
                    sqldb.query(sql, [], callback);
                });
            });
        });
    },

    oldSync: function(courseInfo, testDB, questionDB, callback) {
        var that = module.exports;
        var filename = "/tmp/submissions.csv";
        that.readExistingMongoIDs(function(err, mongoIDs) {
            if (err) return callback(err);
            that.mongoToFile(filename, courseInfo, testDB, questionDB, mongoIDs, function(err) {
                if (err) return callback(err);
                that.fileToSQL(filename, function(err) {
                    if (err) return callback(err);
                    callback(null);
                });
            });
        });
    },
        
    oldReadExistingMongoIDs: function(callback) {
        var sql = 'SELECT mongo_id FROM submissions;'
        Promise.try(function() {
            return models.sequelize.query(sql);
        }).spread(function(results, info) {
            var mongoIDs = {};
            _(results).each(function(result) {
                mongoIDs[result.mongo_id] = true;
            });
            callback(null, mongoIDs);
        }).catch(function(err) {
            callback(err);
        });
    },

    oldMongoToFile: function(filename, courseInfo, testDB, questionDB, mongoIDs, callback) {
        fs.open(filename, "w", function(err, fd) {
            if (err) return callback(err);
            db.sCollect.find({}, function(err, cursor) {
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
                            if (mongoIDs[obj._id] != null) {
                                // already have this object in the SQL DB, skip to next iteration
                                if (i % 1000 == 0) {
                                    setTimeout(handle, 0);
                                } else {
                                    handle();
                                }
                            } else {
                                // don't have this object yet in SQL DB, write it to the CSV file
                                csvData = [[
                                    String(obj._id),
                                    obj.sid,
                                    moment(obj.date).tz(config.timezone).format(),
                                    obj.uid,
                                    obj.qiid,
                                    obj.score,
                                    obj.overrideScore,
                                    (obj.practice ? 'practice' : 'score'),
                                    (obj.feedback ? JSON.stringify(obj.feedback).replace(/\\u0000/g, '') : ''),
                                    (obj.submittedAnswer ? JSON.stringify(obj.submittedAnswer).replace(/\\u0000/g, '') : ''),
                                ]];
                                csvStringify(csvData, function(err, csv) {
                                    fs.write(fd, csv, function(err) {
                                        if (err) return callback(err);
                                        if (i % 1000 == 0) {
                                            setTimeout(handle, 0);
                                        } else {
                                            handle();
                                        }
                                    });
                                });
                            }
                        })
                    })();
                });
            });
        });
    },

    oldFileToSQL: function(filename, callback) {
        var sql
            = ' COPY submissions ('
            + '     mongo_id,'
            + '     sid,'
            + '     date,'
            + '     uid,'
            + '     qiid,'
            + '     score,'
            + '     override_score,'
            + '     type,'
            + '     feedback,'
            + '     submitted_answer'
            + ' ) FROM :filename'
            + ' WITH (FORMAT csv)'
            + ' ;';
        var params = {
            filename: filename,
        };
        Promise.try(function() {
            return models.sequelize.query(sql, {replacements: params});
        }).spread(function(results, info) {
            //logger.infoOverride("copied to accesses: " + info.rowCount);
            callback(null);
        }).catch(function(err) {
            callback(err);
        });
    },







    oldoldSync: function(courseInfo, testDB, questionDB, callback) {
        var that = module.exports;
        var lastSubmissions = {};
        var lastTISubmissions = {};
        // find all the testInstances in mongo
        db.sCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.toArray(function(err, objs) {
                if (err) return callback(err);
                // only process submissions for questions that we have on disk
                objs = _(objs).filter(function(o) {return _(questionDB).has(o.qid);});
                async.forEachOfSeries(objs, function(s, i, callback) {
                    if (i % 1000 === 0) logger.infoOverride("submissions: " + i + " of " + objs.length);
                    Promise.try(function() {
                        var user, questionInstance, testQuestion, question, testInstance, test, submission, grading, tiid, qid;
                        return Promise.try(function() {
                            return models.User.findOne({where: {
                                uid: s.uid,
                            }});
                        }).then(function(findUser) {
                            user = findUser;
                            if (!user) throw Error('no user where uid = ' + s.uid + ' for sid = ' + s.sid);
                            return models.QuestionInstance.findOne({where: {
                                qiid: s.qiid,
                            }});
                        }).then(function(findQuestionInstance) {
                            questionInstance = findQuestionInstance;
                            if (!questionInstance) throw Error('no questionInstance where qiid = ' + s.qiid + ' for sid = ' + s.sid);
                            return models.TestQuestion.findOne({where: {
                                id: questionInstance.testQuestionId,
                            }});
                        }).then(function(findTestQuestion) {
                            testQuestion = findTestQuestion;
                            if (!testQuestion) throw Error('no testQuestion where id = ' + questionInstance.testQuestionId + ' for sid = ' + s.sid);
                            return models.Question.findOne({where: {
                                id: testQuestion.questionId,
                            }});
                        }).then(function(findQuestion) {
                            question = findQuestion;
                            if (!question) throw Error('no question where id = ' + testQuestion.questionId + ' for sid = ' + s.sid);
                            qid = question.qid;
                            if (qid == null) throw Error('qid is null for question_id = ' + question.id);
                            return models.TestInstance.findOne({where: {
                                id: questionInstance.testInstanceId,
                            }});
                        }).then(function(findTestInstance) {
                            testInstance = findTestInstance;
                            if (!testInstance) throw Error('no testInstance');
                            tiid = testInstance.tiid;
                            return models.Test.findOne({where: {
                                id: testInstance.testId,
                            }});
                        }).then(function(findTest) {
                            test = findTest;
                            if (!test) throw Error('no test');
                            return models.Submission.findOrCreate({where: {
                                sid: s.sid,
                            }});
                        }).spread(function(newSubmission, created) {
                            submission = newSubmission;
                            return submission.update({
                                date: s.date,
                                questionInstanceId: questionInstance.id,
                                authUserId: user.id,
                                submittedAnswer: s.submittedAnswer,
                                type: (s.practice ? 'practice' : 'score'),
                                overrideScore: s.overrideScore,
                            });
                        }).then(function() {
                            return models.Grading.findOrCreate({where: {
                                submissionId: submission.id,
                            }});
                        }).spread(function(newGrading, created) {
                            grading = newGrading;
                            if (!_(lastSubmissions).has(tiid)) {
                                lastSubmissions[tiid] = {};
                            }
                            var newLastSubmission = {
                                date: s.date,
                                gradingId: grading.id,
                                questionInstanceId: questionInstance.id,
                                testInstanceId: testInstance.id,
                                authUserId: user.id,
                                submissionScore: s.score,
                                testType: test.type,
                            };
                            if (!_(lastSubmissions[tiid]).has(qid) || lastSubmissions[tiid][qid].date < s.date) {
                                lastSubmissions[tiid][qid] = newLastSubmission;
                            }
                            if (!_(lastTISubmissions).has(tiid) || lastTISubmissions[tiid].date < s.date) {
                                lastTISubmissions[tiid] = newLastSubmission;
                            }
                            if (!created) return Promise.resolve();
                            return grading.update({
                                date: s.date,
                                authUserId: user.id,
                                score: s.score,
                                feedback: s.feedback,
                            });
                        }).then(function() {
                            callback(null);
                        }).catch(function(err) {
                            logger.error(err);
                            callback(null);
                        });
                    });
                }, function(err) {
                    if (err) return callback(err);
                    that.syncQuestionScores(lastSubmissions, function(err) {
                        if (err) return callback(err);
                        that.syncTestScoreDates(lastTISubmissions, callback);
                    });
                });
            });
        });
    },

    syncQuestionScores: function(lastSubmissions, callback) {
        async.forEachOfSeries(lastSubmissions, function(lastSubmissionsByQID, tiid, callback) {
            db.tiCollect.findOne({tiid: tiid}, function(err, tInstance) {
                if (err) return callback(err);
                if (tInstance == null) return callback("No tInstance with tiid = " + tiid);
                var tid = tInstance.tid;
                db.tCollect.findOne({tid: tid}, function(err, test) {
                    if (err) return callback(err);
                    if (test == null) return callback("No test with tid = " + tid);
                    async.forEachOfSeries(lastSubmissionsByQID, function(lastSubmission, qid, callback) {
                        var points, maxPoints;
                        if (lastSubmission.testType == 'Exam') {
                            if (!_(tInstance).has('questions')) return callback('no questions for Exam');
                            points = (lastSubmission.submissionScore >= 0.5 ? 1 : 0);
                            maxPoints = 1;
                        } else if (lastSubmission.testType == 'RetryExam') {
                            if (!_(tInstance).has('questionsByQID')) return callback('no questionsByQID for RetryExam');
                            if (!_(tInstance.questionsByQID).has(qid)) return callback('questionsByQID does not have qid = ' + qid + ', for tiid = ' + tiid);
                            points = tInstance.questionsByQID[qid].awardedPoints;
                            maxPoints = _(tInstance.questionsByQID[qid].points).max();
                        } else if (lastSubmission.testType == 'Game') {
                            if (!_(tInstance).has('qData')) return callback('no qData for Game');
                            if (!_(test).has('qParams')) return callback('no qParams for Game');
                            if (!_(tInstance.qData).has(qid)) return callback('qData does not have qid = ' + qid + ', for tiid = ' + tiid);
                            if (!_(test.qParams).has(qid)) return callback('qParams does not have qid = ' + qid + ', for tiid = ' + tiid);
                            points = tInstance.qData[qid].score;
                            maxPoints = test.qParams[qid].maxScore;
                        } else if (lastSubmission.testType == 'Basic') {
                            if (!_(tInstance).has('qData')) return callback('no qData for Basic');
                            if (!_(tInstance.qData).has(qid)) return callback('qData does not have qid = ' + qid + ', for tiid = ' + tiid);
                            points = tInstance.qData[qid].avgScore;
                            maxPoints = 1;
                        } else {
                            logger.warn("Couldn't determine type of tInstance with tiid = " + tiid);
                            return callback(null);
                        }
                        models.QuestionScore.findOne({where: {
                            gradingId: lastSubmission.gradingId,
                        }}).then(function(questionScore) {
                            if (questionScore) return Promise.resolve(); // already have a questionScore, don't do anything
                            return models.QuestionScore.create({
                                date: lastSubmission.date,
                                gradingId: lastSubmission.gradingId,
                                questionInstanceId: lastSubmission.questionInstanceId,
                                authUserId: lastSubmission.authUserId,
                                points: points,
                                maxPoints: maxPoints,
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
        }, function(err) {
            if (err) return callback(err);
            callback(null);
        });
    },

    syncTestScoreDates: function(lastTISubmissions, callback) {
        async.forEachOfSeries(lastTISubmissions, function(lastSubmission, tiid, callback) {
            models.TestScore.findOne({where: {
                testInstanceId: lastSubmission.testInstanceId,
                date: null
            }}).then(function(testScore) {
                if (!testScore) return Promise.resolve();
                return testScore.update({
                    date: lastSubmission.date,
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
    },
};
