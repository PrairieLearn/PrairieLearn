define(["underscore", "moment-timezone", "PrairieRandom"], function(_, moment, PrairieRandom) {

    var db = process.mainModule.require('./db');
    var async = process.mainModule.require('async');

    var RetryExamTestServer = {};

    RetryExamTestServer.getDefaultOptions = function() {
        return {
            autoCreateQuestions: true,
            allowQuestionSubmit: false,
            allowQuestionSave: true,
            allowQuestionRetry: true,
            showQuestionTitle: false,
            allowFinish: true,
            unlimitedVariants: false,
            variantsPerQuestion: 3,
        };
    };

    RetryExamTestServer.updateTest = function(test, options) {
        _.defaults(test, {
            scoresByUID: {},
            highScoresByUID: {},
            completeHighScoresByUID: {},
            scores: {},
            highScores: {},
            completeHighScores: {},
            questionInfo: {},
        });
        if (options && options.questionGroups) {
            // FIXME: remove once we have fully transitions to zones
            test.nQuestions = options.nQuestions;
            test.maxScore = _.chain(options.questionGroups)
                .flatten()
                .pluck("points")
                .map(function(a) {return Math.max.apply(null, a);})
                .reduce(function(a, b) {return a + b;}, 0).value();
            test.maxQScoresByQID = _.chain(options.questionGroups)
                .flatten()
                .map(function(q) {return [q.qid, _.max(q.points)];})
                .object()
                .value();
            test.qids = _.chain(options.questionGroups)
                .flatten()
                .pluck('qid')
                .value();
        } else {
            // new code that should always be used in the future
            test.nQuestions = _.chain(options.zones)
                .pluck("questions")
                .map(function(x) {return x.length;})
                .reduce(function(a, b) {return a + b;}, 0).value();
            test.maxScore = _.chain(options.zones)
                .pluck("questions")
                .flatten()
                .pluck("points")
                .map(function(p) {return _.max(p);})
                .reduce(function(a, b) {return a + b;}, 0).value();
            test.maxQScoresByQID = {};
            _.chain(options.zones)
                .pluck("questions")
                .flatten()
                .each(function(q) {
                    if (q.qid) {
                        test.maxQScoresByQID[q.qid] = _.max(q.points);
                    } else if (q.qids) {
                        _(q.qids).each(function(qid) {
                            test.maxQScoresByQID[qid] = _.max(q.points);
                        });
                    }
                });
            test.qids = [];
            _.chain(options.zones)
                .pluck("questions")
                .flatten()
                .each(function(q) {
                    if (q.qid) {
                        test.qids.push(q.qid);
                    } else if (q.qids) {
                        test.qids = _.union(test.qids, q.qids);
                    }
                });
            test.qids = _.uniq(test.qids);
        }
        if (!options.unlimitedVariants) {
            test.vidsByQID = test.vidsByQID || {};
            _(options.zones).each(function(zone) {
                _(zone.questions).each(function(question) {
                    var qids = [];
                    if (question.qid) qids.push(question.qid);
                    if (question.qids) qids.push.apply(qids, question.qids);
                    _(qids).each(function(qid) {
                        if (!test.vidsByQID[qid]) test.vidsByQID[qid] = [];
                        if (test.vidsByQID[qid].length > options.variantsPerQuestion) {
                            test.vidsByQID[qid] = _(test.vidsByQID[qid]).first(options.variantsPerQuestion);
                        }
                        while (test.vidsByQID[qid].length < options.variantsPerQuestion) {
                            test.vidsByQID[qid].push(Math.floor(Math.random() * Math.pow(2, 32)).toString(36));
                        }
                    });
                });
            });
        }
        test.text = options.text;
        test._private = ["scoresByUID", "highScoresByUID", "completeHighScoresByUID"];
        if (options.availDate)
            test.availDate = moment.tz(options.availDate, options.timezone).format();
    };

    RetryExamTestServer.updateTInstance = function(tInstance, test, options, questionDB, callback) {
        if (_(tInstance).has('score') && !_(tInstance).has('scorePerc')) {
            // upgrade a score to a scorePerc, without applying credit limits
            tInstance.scorePerc = Math.floor(tInstance.score / test.maxScore * 100);
        }
        _(tInstance).defaults({
            scorePerc: 0,
        });
        if (tInstance.qids === undefined) {
            var questions = [];
            var rand = new PrairieRandom.RandomGenerator();
            if (options && options.questionGroups) {
                // FIXME: remove once we have fully transitions to zones
                var levelChoices = rand.randCategoryChoices(options.nQuestions, options.questionGroups.length);
                var iLevel, iType, typeChoices;
                for (iLevel = 0; iLevel < options.questionGroups.length; iLevel++) {
                    typeChoices = rand.randCategoryChoices(levelChoices[iLevel], options.questionGroups[iLevel].length);
                    for (iType = 0; iType < options.questionGroups[iLevel].length; iType++) {
                        questions = questions.concat(rand.randNElem(typeChoices[iType], options.questionGroups[iLevel][iType]));
                    }
                }
            } else {
                // new code that should always be used in the future
                tInstance.zones = [];
                tInstance.showZoneTitles = false;
                _(options.zones).each(function(zone) {
                    if (_(zone).has("title")) {
                        tInstance.showZoneTitles = true;
                        tInstance.zones[questions.length] = zone.title;
                    } else {
                        tInstance.zones[questions.length] = null;
                    }
                    var zoneQuestions = [];
                    _(zone.questions).each(function(question) {
                        var qid;
                        if (_(question).has("qid")) {
                            qid = question.qid
                        } else {
                            qid = rand.randElem(question.qids);
                        }
                        var vid = null;
                        if (!options.unlimitedVariants) {
                            vid = rand.randElem(test.vidsByQID[qid]);
                        }
                        zoneQuestions.push({qid: qid, vid: vid, points: question.points});
                    });
                    rand.shuffle(zoneQuestions);
                    questions.push.apply(questions, zoneQuestions);
                });
            }
            var now = Date.now();
            tInstance.qids = _(questions).pluck('qid');
            tInstance.maxScore = 0;
            tInstance.questionsByQID = _(questions).indexBy('qid');
            tInstance.vidsByQID = _(tInstance.questionsByQID).mapObject(function(q) {return q.vid;});
            _(tInstance.questionsByQID).each(function(question, qid) {
                question.nGradedAttempts = 0;
                question.awardedPoints = 0;
                question.correct = false;
                tInstance.maxScore += Math.max.apply(null, question.points);
            });
            tInstance.createDate = new Date(now).toJSON();
            tInstance.open = true;
            tInstance.submissionsByQid = {};
            tInstance.score = 0;
            tInstance.gradingDates = [];
        }
        tInstance.questions = [];
        _(tInstance.qids).each(function(qid) {
            tInstance.questions.push({
                qid: qid,
            });
        });

        // convert old Exam tInstances to RetryExams
        if (tInstance.questionsByQID === undefined) {
            tInstance.questionsByQID = {};
            if (!tInstance.submissionsByQid) tInstance.submissionsByQid = {};

            async.each(tInstance.qids, function(qid, cb) {
                if (!tInstance.qiidsByQid) return cb("No qiidsByQid");
                var qiid = tInstance.qiidsByQid[qid];
                if (!qiid) return cb("No qiidsByQid.qid for qid: " + qid);
                db.qiCollect.findOne({qiid: qiid}, function(err, qInstance) {
                    if (err) return cb(err);
                    if (!qInstance) return cb("No qInstance with qiid " + qiid);

                    tInstance.questionsByQID[qid] = {
                        qid: qid,
                        vid: qInstance.vid,
                        points: [1],
                    };

                    cb(null);
                });
            }, function(err) {
                if (err) return callback(err);

                tInstance.vidsByQID = _(tInstance.questionsByQID).pluck('vid');
                tInstance.maxScore = 0;
                tInstance.gradingDates = [];
                if (tInstance.finishDate) {
                    tInstance.gradingDates.push(tInstance.finishDate);
                }
                _(tInstance.questionsByQID).each(function(question, qid) {
                    var submission = tInstance.submissionsByQid[qid];
                    if (tInstance.finishDate && _(submission).has('score')) {
                        question.nGradedAttempts = 1;
                        question.awardedPoints = submission.score;
                        question.correct = (submission.score >= 0.5);
                    } else {
                        question.nGradedAttempts = 0;
                        question.awardedPoints = 0;
                        question.correct = false;
                    }

                    tInstance.maxScore += Math.max.apply(null, question.points);
                });

                callback(null, tInstance);
            });
        } else {
            callback(null, tInstance);
        }
    };

    RetryExamTestServer.updateWithSubmission = function(tInstance, test, submission, options) {
        if (!tInstance.open)
            throw Error("Test is not open");
        if (!_(tInstance.qids).contains(submission.qid))
            throw Error("QID is not in tInstance");
        var question = tInstance.questionsByQID[submission.qid];
        if (question.nGradedAttempts >= question.points.length)
            throw Error("Too many attempts at question");
        if (question.correct)
            throw Error("question is already correct");

        tInstance.submissionsByQid[submission.qid] = submission;
        submission.graded = false;
        submission._private = ["score", "trueAnswer", "feedback", "oldTInstance", "oldTest", "newTInstance", "newTest"];
    };

    RetryExamTestServer.grade = function(tInstance, test) {
        if (!tInstance.open)
            throw Error("Test is not open");

        var score = 0;
        var i, qid, submission, nAnswers = 0;
        for (i = 0; i < tInstance.qids.length; i++) {
            qid = tInstance.qids[i];
            submission = tInstance.submissionsByQid[qid];
            if (submission === undefined)
                continue;
            question = tInstance.questionsByQID[qid];
            if (!submission.graded) {
                if (submission.score >= 0.5) {
                    question.correct = true;
                    submission.correct = true;
                    question.awardedPoints = question.points[question.nGradedAttempts];
                } else {
                    submission.correct = false;
                }
                question.nGradedAttempts++;
                submission.graded = true;
                submission._private = _(submission._private).without('feedback');
            }
        }
        if (_(test.credit).isFinite() && test.credit > 0) {
            tInstance.gradingDates.push(new Date().toJSON());

            tInstance.score = 0;
            _(tInstance.questionsByQID).forEach(function(question) {
                tInstance.score += question.awardedPoints;
            });
            tInstance.score = Math.min(tInstance.score, test.maxScore);

            // compute the score as a percentage, applying credit bonus/limits
            newScorePerc = Math.floor(tInstance.score / test.maxScore * 100);
            if (test.credit < 100) {
                newScorePerc = Math.min(newScorePerc, test.credit);
            }
            if (test.credit > 100) {
                newScorePerc = Math.min(test.credit, Math.floor(newScorePerc * test.credit / 100));
            }
            tInstance.scorePerc = newScorePerc;
        }
    };

    RetryExamTestServer.finish = function(tInstance, test) {
        if (!tInstance.open)
            throw Error("Test is already finished");

        this.grade(tInstance, test);
        
        var i, qid, submission, question, nAnswers = 0;
        for (i = 0; i < tInstance.qids.length; i++) {
            qid = tInstance.qids[i];
            question = tInstance.questionsByQID[qid];
            if (test.questionInfo[qid] === undefined)
                test.questionInfo[qid] = {
                    nAttempts: 0,
                    nCorrect: 0,
                };
            if (question.correct) {
                test.questionInfo[qid].nCorrect++;
            }
            submission = tInstance.submissionsByQid[qid];
            if (submission !== undefined) {
                test.questionInfo[qid].nAttempts++;
                nAnswers++;
                delete submission._private;
            }
        }
        var complete = (nAnswers === tInstance.qids.length);
        tInstance.finishDate = new Date().toJSON();

        tInstance.open = false;
    };

    return RetryExamTestServer;
});
