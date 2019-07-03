var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var naturalSort = require('javascript-natural-sort');

var logger = require('../../lib/logger');
var error = require('@prairielearn/prairielib/error');
var sqldb = require('@prairielearn/prairielib/sql-db');
var config = require('../../lib/config');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const perfMarkers = {};

const start = (name) => {
    perfMarkers[name] = new Date();
}

const end = (name) => {
    if (!(name in perfMarkers)) {
        return;
    }
    console.log(`${name} took ${(new Date()) - perfMarkers[name]}ms`);
}

function asyncQueryOneRow(sql, params) {
    return new Promise((resolve, reject) => {
        sqldb.queryOneRow(sql, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function asyncCallOneRow(sql, params) {
    return new Promise((resolve, reject) => {
        sqldb.callOneRow(sql, params, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        })
    })
}

function safeAsync(func, callback) {
    new Promise(async () => {
        let error = null;
        let result;
        try {
            result = await func();
        } catch (err) {
            error = err;
        }
        callback(error, result);
    });
};

/**
 * SYNCING PROCESS:
 * 
 * 1. Assign order_by number to every assessment
 * 2. Check that no UUIDs are duplicated within this course instance
 * 3. Check that no UUIDS are duplicated in any other course instance
 * 4. For each assessment...
 *   a) Insert an assessment; associate the ID of the new assessment with the assessment object
 *   b) For each access rule from the assessment...
 *     i) Ensure that a PS exam exists if needed (if an `examUuid` exists)
 *     ii) Insert the access rule with a new number
 *   c) Delete excess assessment access rules
 *   d) For each zone from the assessment...
 *     i) Insert the zone with a new number; associate the ID of the new zone with the zone object
 *   e) Delete any excess zones from the current assessment using the zone number
 *   f) For each zone from the assessment...
 *     i) Generate a list of alternatives for the zone (either one or many questions, depending on if `id` or `alternatives` is used)
 *     ii) Insert a new alternative group
 *     iii) For each alternative in the group...
 *       1. Insert an assessment question
 *   g) Delete excess alternative groups
 *   h) Soft-delete unused assessments (that were deleted since the last sync)
 *   i) Soft-delete unused assessment questions (from deleted assessments)
 *   j) Soft-delete unused assessment questions (from deleted assessments)
 *   k) Delete unused assessment access rules (from deleted assessments)
 *   l) Delete unused zones (from deletes assessments)
 */

/**
 * Builds the giant blob of JSON that will be shipped to the assessments syncing sproc.
 */
function buildSyncData(courseInfo, courseInstance, questionDB) {
    const assessments = Object.entries(courseInstance.assessmentDB).map(([tid, assessment]) => {
        // issue reporting defaults to true, then to the courseInstance setting, then to the assessment setting
        let allowIssueReporting = true;
        if (_.has(assessment, 'allowIssueReporting')) allowIssueReporting = !!assessment.allowIssueReporting;
        const assessmentParams = {
            tid: tid,
            uuid: assessment.uuid,
            type: assessment.type,
            number: assessment.number,
            order_by: assessment.order_by,
            title: assessment.title,
            config: assessment.options,
            multiple_instance: assessment.multipleInstance ? true : false,
            shuffle_questions: assessment.shuffleQuestions ? true : false,
            allow_issue_reporting: allowIssueReporting,
            auto_close: _.has(assessment, 'autoClose') ? assessment.autoClose : true,
            max_points: assessment.maxPoints,
            set_name: assessment.set,
            text: assessment.text,
            constant_question_value: _.has(assessment, 'constantQuestionValue') ? assessment.constantQuestionValue : false,
        };

        const allowAccess = assessment.allowAccess || [];
        assessmentParams.allowAccess = allowAccess.map((accessRule, index) => {
            return {
                number: index + 1,
                mode: _(accessRule).has('mode') ? accessRule.mode : null,
                role: _(accessRule).has('role') ? accessRule.role : null,
                uids: _(accessRule).has('uids') ? accessRule.uids : null,
                start_date: _(accessRule).has('startDate') ? accessRule.startDate : null,
                end_date: _(accessRule).has('endDate') ? accessRule.endDate : null,
                credit: _(accessRule).has('credit') ? accessRule.credit : null,
                time_limit_min: _(accessRule).has('timeLimitMin') ? accessRule.timeLimitMin : null,
                password: _(accessRule).has('password') ? accessRule.password : null,
                seb_config: _(accessRule).has('SEBConfig') ? accessRule.SEBConfig : null,
                exam_uuid: _(accessRule).has('examUuid') ? accessRule.examUuid : null,
            }
        });

        const zones = assessment.zones || [];
        assessmentParams.zones = zones.map((zone, index) => {
            return {
                number: index + 1,
                title: zone.title,
                number_choose: zone.numberChoose,
                max_points: zone.maxPoints,
                best_questions: zone.bestQuestions,
            };
        });

        let alternativeGroupNumber = 0;
        let assessmentQuestionNumber = 0;
        assessmentParams.alternativeGroups = zones.map((zone, zoneIndex) => {
            return zone.questions.map((question, questionIndex) => {
                let alternatives;
                if (_(question).has('alternatives')) {
                    if (_(question).has('id')) return callback(error.make(400, 'Cannot have both "id" and "alternatives" in one question', {question}));
                    alternatives = _.map(question.alternatives, function(alternative) {
                        return {
                            qid: alternative.id,
                            maxPoints: alternative.maxPoints || question.maxPoints,
                            points: alternative.points || question.points,
                            forceMaxPoints: _.has(alternative, 'forceMaxPoints') ? alternative.forceMaxPoints
                                : (_.has(question, 'forceMaxPoints') ? question.forceMaxPoints : false),
                            triesPerVariant: _.has(alternative, 'triesPerVariant') ? alternative.triesPerVariant : (_.has(question, 'triesPerVariant') ? question.triesPerVariant : 1),
                        };
                    });
                } else if (_(question).has('id')) {
                    alternatives = [
                        {
                            qid: question.id,
                            maxPoints: question.maxPoints,
                            points: question.points,
                            forceMaxPoints: _.has(question, 'forceMaxPoints') ? question.forceMaxPoints : false,
                            triesPerVariant: _.has(question, 'triesPerVariant') ? question.triesPerVariant : 1,
                        }
                    ];
                } else {
                    throw error.make(400, 'Must specify either "id" or "alternatives" in question', {question});
                }

                for (let i = 0; i < alternatives.length; i++) {
                    const alternative = alternatives[i];

                    if (assessment.type == 'Exam') {
                        if (alternative.maxPoints != undefined) {
                            throw error.make(400, 'Cannot specify "maxPoints" for a question in an "Exam" assessment', {question});
                        }
                        if (alternative.points == undefined) {
                            throw error.make(400, 'Must specifiy "points" for a question in an "Exam" assessment', {question});
                        }
                        if (_.isArray(alternative.points)) {
                            alternative.pointsList = alternative.points;
                        } else {
                            alternative.pointsList = [alternative.points];
                        }
                        delete alternative.points;
                        alternative.maxPoints = _.max(alternative.pointsList);
                    }
                    if (assessment.type == 'Homework') {
                        if (alternative.points == undefined) {
                            throw error.make(400, 'Must specifiy "points" for a question in a "Homework" assessment', {question});
                        }
                        if (_.isArray(alternative.points)) {
                            throw error.make(400, 'Cannot specify "points" as a list for a question in a "Homework" assessment', {question});
                        }
                        if (alternative.maxPoints == undefined) {
                            alternative.maxPoints = alternative.points;
                        }
                        alternative.initPoints = alternative.points;
                    }
                }

                alternativeGroupNumber++;
                const alternativeGroupParams = {
                    number: alternativeGroupNumber,
                    number_choose: question.numberChoose,
                };

                alternativeGroupParams.questions = alternatives.map((alternative, alternativeIndex) => {
                    assessmentQuestionNumber++;
                    // Loop up the ID of this question based on its QID
                    const question = questionDB[alternative.qid]
                    if (!question) {
                        throw new Error(`Invalid QID: ${qid}`);
                    }
                    const questionId = question.id;
                    return {
                        number: assessmentQuestionNumber,
                        max_points: alternative.maxPoints,
                        points_list: alternative.pointsList,
                        init_points: alternative.initPoints,
                        force_max_points: alternative.forceMaxPoints,
                        tries_per_variant: alternative.triesPerVariant,
                        question_id: questionId,
                        number_in_alternative_group: alternativeIndex + 1,
                    }

                });

                return alternativeGroupParams;
            });
        });

        // Needed when deleting unused alternative groups
        assessmentParams.lastAlternativeGroupNumber = alternativeGroupNumber;

        return assessmentParams;
    });

    return {
        assessments,
        course_instance_id: courseInstance.courseInstanceId,
        course_id: courseInfo.courseId,
        check_access_rules_exam_uuid: config.checkAccessRulesExamUuid,
    }
}

module.exports.sync = function(courseInfo, courseInstance, questionDB, callback) {
    safeAsync(async () => {
        const { assessmentDB } = courseInstance;
        // Assign an ordering to all assessments
        const assessmentList = Object.values(assessmentDB);
        assessmentList.sort((a, b) => naturalSort(String(a.number), String(b.number)));
        assessmentList.forEach((assessment, index) => assessment.order_by = index);

        // Check for duplicate UUIDs within the course instance's assessments
        // TODO: does this correctly detect duplicates across course instances within one course?
        _(assessmentDB)
            .groupBy('uuid')
            .each(function(assessments, uuid) {
                if (assessments.length > 1) {
                    const directories = assessments.map(a => a.directory).join(', ');
                    throw new Error(`UUID ${uuid} is used in multiple assessments: ${directories}`)
                }
            });

        // Check if any of the UUIDs used in this course instance's assessments
        // are used by any other course instance
        const params = [
            JSON.stringify(Object.values(assessmentDB).map(a => a.uuid)),
            courseInstance.courseInstanceId,
        ];

        start(`syncAssessments${courseInstance.courseInstanceId}DuplicateUUIDSproc`);
        const duplicateUuidResult = await asyncCallOneRow('sync_check_duplicate_assessment_uuids', params);
        end(`syncAssessments${courseInstance.courseInstanceId}DuplicateUUIDSproc`);

        const duplicateUUID = duplicateUuidResult.rows[0].duplicate_uuid;
        if (duplicateUUID) {
            // Determine the corresponding TID to provide a useful error
            const tid = Object.keys(assessmentDB).find((tid) => assessmentDB[tid].uuid === duplicateUUID);
            throw new Error(`UUID ${duplicateUUID} from assessment ${tid} is already in use by a different course instance (possibly in a different course)`);
        }

        const syncData = buildSyncData(courseInfo, courseInstance, questionDB);
        const syncParams = [
            JSON.stringify(syncData.assessments),
            syncData.course_id,
            syncData.course_instance_id,
            syncData.check_access_rules_exam_uuid,
        ];
        start(`syncAssessments${courseInstance.courseInstanceId}Sproc`);
        await asyncCallOneRow('sync_assessments', syncParams);
        end(`syncAssessments${courseInstance.courseInstanceId}Sproc`);
    }, callback);
}

module.exports.synccc = function(courseInfo, courseInstance, questionDB, callback) {
    console.log(JSON.stringify(buildSyncData(courseInfo, courseInstance, questionDB)));
    var assessmentIds = [];
    async.series([
        function(callback) {
            var assessmentList = _.values(courseInstance.assessmentDB);
            assessmentList.sort(function(a, b) {return naturalSort(String(a.number), String(b.number));});
            _.each(assessmentList, function(assessment, i) {assessment.order_by = i;});
            callback(null);
        },
        function(callback) {
            var err = null;
            _(courseInstance.assessmentDB)
                .groupBy('uuid')
                .each(function(assessments, uuid) {
                    if (assessments.length > 1) {
                        err = new Error('UUID ' + uuid + ' is used in multiple assessments: '
                                        + _.map(assessments, 'directory').join());
                        return false; // terminate each()
                    }
                });
            if (err) return callback(err);
            callback(null);
        },
        function(callback) {
            start("checkDuplicateUUIDs");
            async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                logger.debug('Checking uuid for ' + tid);
                sqldb.call('assessments_with_uuid_elsewhere', [courseInstance.courseInstanceId, dbAssessment.uuid], function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount > 0) return callback(new Error('UUID ' + dbAssessment.uuid + ' from assessment ' + tid + ' in ' + courseInstance.directory + ' already in use in different course instance (possibly in a different course)'));
                    callback(null);
                });
            }, function(err) {
                end("checkDuplicateUUIDs");
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            start("syncCourseInstanceAssessments");
            async.forEachOfSeries(courseInstance.assessmentDB, function(dbAssessment, tid, callback) {
                start(`syncCourseInstanceAssessment${tid}`);
                logger.debug('Syncing ' + tid);
                // issue reporting defaults to true, then to the courseInstance setting, then to the assessment setting
                var allow_issue_reporting = true;
                if (_.has(dbAssessment, 'allowIssueReporting')) allow_issue_reporting = !!dbAssessment.allowIssueReporting;
                var params = {
                    tid: tid,
                    uuid: dbAssessment.uuid,
                    type: dbAssessment.type,
                    number: dbAssessment.number,
                    order_by: dbAssessment.order_by,
                    title: dbAssessment.title,
                    config: dbAssessment.options,
                    multiple_instance: dbAssessment.multipleInstance ? true : false,
                    shuffle_questions: dbAssessment.shuffleQuestions ? true : false,
                    allow_issue_reporting: allow_issue_reporting,
                    auto_close: _.has(dbAssessment, 'autoClose') ? dbAssessment.autoClose : true,
                    max_points: dbAssessment.maxPoints,
                    course_instance_id: courseInstance.courseInstanceId,
                    course_id: courseInfo.courseId,
                    set_name: dbAssessment.set,
                    text: dbAssessment.text,
                    constant_question_value: _.has(dbAssessment, 'constantQuestionValue') ? dbAssessment.constantQuestionValue : false,
                };
                sqldb.query(sql.insert_assessment, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    var assessmentId = result.rows[0].id;
                    assessmentIds.push(assessmentId);
                    logger.debug('Synced ' + tid + ' as assessment_id ' + assessmentId);
                    start(`syncCourseInstanceAssessment${tid}AccessRules`);
                    syncAccessRules(assessmentId, dbAssessment, function(err) {
                        end(`syncCourseInstanceAssessment${tid}AccessRules`);
                        if (ERR(err, callback)) return;
                        start(`syncCourseInstanceAssessment${tid}Zones`);
                        syncZones(assessmentId, dbAssessment, function(err) {
                            end(`syncCourseInstanceAssessment${tid}Zones`);
                            if (ERR(err, callback)) return;
                            start(`syncCourseInstanceAssessment${tid}Questions`);
                            syncAssessmentQuestions(assessmentId, dbAssessment, courseInfo, questionDB, function(err) {
                                end(`syncCourseInstanceAssessment${tid}Questions`);
                                if (ERR(err, callback)) return;
                                callback(null);
                            });
                        });
                    });
                });
            }, function(err) {
                end("syncCourseInstanceAssessments");
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            logger.debug('Soft-deleting unused assessments');
            var params = {
                course_instance_id: courseInstance.courseInstanceId,
                keep_assessment_ids: assessmentIds,
            };
            sqldb.query(sql.soft_delete_unused_assessments, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            logger.debug('Soft-deleting unused assessment questions');
            var params = {
                course_instance_id: courseInstance.courseInstanceId,
                keep_assessment_ids: assessmentIds,
            };
            sqldb.query(sql.soft_delete_unused_assessment_questions, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            logger.debug('Deleting unused assessment access rules');
            sqldb.query(sql.delete_unused_assessment_access_rules, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        function(callback) {
            logger.debug('Deleting unused zones');
            sqldb.query(sql.delete_unused_zones, [], function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function ensurePSExamIfNeeded(dbRule, dbAssessment, callback) {
    if (!_(dbRule).has('examUuid')) {
        return callback(null);
    }

    if (config.checkAccessRulesExamUuid) {
        const params = {
            exam_uuid: dbRule.examUuid,
        };
        sqldb.query(sql.select_exams_by_uuid, params, function(err, result) {
            if (ERR(err, callback)) return;
            if (result.rowCount == 0) {
                return callback(new Error(`Assessment ${dbAssessment.tid} allowAccess: No such examUuid ${dbRule.examUuid} found in database. Double-check the scheduler to ensure you copied the correct thing?`));
            }
            callback(null);
        });
    } else {
        callback(null);
    }
}

function syncAccessRules(assessmentId, dbAssessment, callback) {
    var allowAccess = dbAssessment.allowAccess || [];
    async.forEachOfSeries(allowAccess, function(dbRule, i, callback) {
        logger.debug('Syncing assessment access rule number ' + (i + 1));
        ensurePSExamIfNeeded(dbRule, dbAssessment, function(err) {
            if (ERR(err, callback)) return;
            var params = {
                assessment_id: assessmentId,
                number: i + 1,
                mode: _(dbRule).has('mode') ? dbRule.mode : null,
                role: _(dbRule).has('role') ? dbRule.role : null,
                uids: _(dbRule).has('uids') ? dbRule.uids : null,
                start_date: _(dbRule).has('startDate') ? dbRule.startDate : null,
                end_date: _(dbRule).has('endDate') ? dbRule.endDate : null,
                credit: _(dbRule).has('credit') ? dbRule.credit : null,
                time_limit_min: _(dbRule).has('timeLimitMin') ? dbRule.timeLimitMin : null,
                password: _(dbRule).has('password') ? dbRule.password : null,
                seb_config: _(dbRule).has('SEBConfig') ? dbRule.SEBConfig : null,
                exam_uuid: _(dbRule).has('examUuid') ? dbRule.examUuid : null,
            };
            sqldb.query(sql.insert_assessment_access_rule, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    }, function(err) {
        if (ERR(err, callback)) return;

        logger.debug('Deleting excess assessment access rules for current assessment');
        var params = {
            assessment_id: assessmentId,
            last_number: allowAccess.length,
        };
        sqldb.query(sql.delete_excess_assessment_access_rules, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
}

function syncZones(assessmentId, dbAssessment, callback) {
    var zoneList = dbAssessment.zones || [];
    async.forEachOfSeries(zoneList, function(dbZone, i, callback) {
        logger.debug('Syncing zone number ' + (i + 1));
        var params = {
            assessment_id: assessmentId,
            number: i + 1,
            title: dbZone.title,
            number_choose: dbZone.numberChoose,
            max_points: dbZone.maxPoints,
            best_questions: dbZone.bestQuestions,
        };
        sqldb.queryOneRow(sql.insert_zone, params, function(err, result) {
            if (ERR(err, callback)) return;
            dbZone.id = result.rows[0].id;
            callback(null);
        });
    }, function(err) {
        if (ERR(err, callback)) return;

        logger.debug('Deleting excess zones for current assessment');
        var params = {
            assessment_id: assessmentId,
            last_number: zoneList.length,
        };
        sqldb.query(sql.delete_excess_zones, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    });
}

function syncAssessmentQuestions(assessmentId, dbAssessment, courseInfo, questionDB, callback) {
    var zoneList = dbAssessment.zones || [];
    var iAssessmentQuestion = 0;
    var iInAlternativeGroup;
    var iAlternativeGroup = 0;
    var assessmentQuestionIds = [];
    async.forEachOfSeries(zoneList, function(dbZone, iZone, callback) {
        async.forEachOfSeries(dbZone.questions, function(dbQuestion, iQuestion, callback) {
            var alternatives;
            if (_(dbQuestion).has('alternatives')) {
                if (_(dbQuestion).has('id')) return callback(error.make(400, 'Cannot have both "id" and "alternatives" in one question', {dbQuestion}));
                alternatives = _.map(dbQuestion.alternatives, function(question) {
                    return {
                        qid: question.id,
                        maxPoints: question.maxPoints || dbQuestion.maxPoints,
                        points: question.points || dbQuestion.points,
                        forceMaxPoints: _.has(question, 'forceMaxPoints') ? question.forceMaxPoints
                            : (_.has(dbQuestion, 'forceMaxPoints') ? dbQuestion.forceMaxPoints : false),
                        triesPerVariant: _.has(question, 'triesPerVariant') ? question.triesPerVariant : (_.has(dbQuestion, 'triesPerVariant') ? dbQuestion.triesPerVariant : 1),
                    };
                });
            } else if (_(dbQuestion).has('id')) {
                alternatives = [
                    {
                        qid: dbQuestion.id,
                        maxPoints: dbQuestion.maxPoints,
                        points: dbQuestion.points,
                        forceMaxPoints: _.has(dbQuestion, 'forceMaxPoints') ? dbQuestion.forceMaxPoints : false,
                        triesPerVariant: _.has(dbQuestion, 'triesPerVariant') ? dbQuestion.triesPerVariant : 1,
                    }
                ];
            } else {
                return callback(error.make(400, 'Must specify either "id" or "alternatives" in question', {dbQuestion}));
            }

            for (var i = 0; i < alternatives.length; i++) {
                var question = alternatives[i];

                if (dbAssessment.type == 'Exam') {
                    if (question.maxPoints != undefined) {
                        return callback(error.make(400, 'Cannot specify "maxPoints" for a question in an "Exam" assessment',
                                                    {dbQuestion}));
                    }
                    if (question.points == undefined) {
                        return callback(error.make(400, 'Must specifiy "points" for a question in an "Exam" assessment',
                                                    {dbQuestion}));
                    }
                    if (_.isArray(question.points)) {
                        question.pointsList = question.points;
                    } else {
                        question.pointsList = [question.points];
                    }
                    delete question.points;
                    question.maxPoints = _.max(question.pointsList);
                }
                if (dbAssessment.type == 'Homework') {
                    if (question.points == undefined) {
                        return callback(error.make(400, 'Must specifiy "points" for a question in a "Homework" assessment',
                                                    {dbQuestion}));
                    }
                    if (_.isArray(question.points)) {
                        return callback(error.make(400, 'Cannot specify "points" as a list for a question in'
                                                    + ' a "Homework" assessment', {dbQuestion}));
                    }
                    if (question.maxPoints == undefined) {
                        question.maxPoints = question.points;
                    }
                    question.initPoints = question.points;
                }
            }

            iAlternativeGroup++;
            var params = {
                number: iAlternativeGroup,
                number_choose: dbQuestion.numberChoose,
                assessment_id: assessmentId,
                zone_id: dbZone.id,
            };
            sqldb.queryOneRow(sql.insert_alternative_group, params, function(err, result) {
                if (ERR(err, callback)) return;
                var alternative_group_id = result.rows[0].id;
                iInAlternativeGroup = 0;
                async.eachSeries(alternatives, function(alternative, callback) {
                    iAssessmentQuestion++;
                    iInAlternativeGroup++;
                    syncAssessmentQuestion(alternative.qid, alternative.maxPoints, alternative.pointsList, alternative.initPoints, alternative.forceMaxPoints, alternative.triesPerVariant, iInAlternativeGroup, iAssessmentQuestion, assessmentId, alternative_group_id, courseInfo, questionDB, function(err, assessmentQuestionId) {
                        if (ERR(err, callback)) return;
                        assessmentQuestionIds.push(assessmentQuestionId);
                        callback(null);
                    });
                }, function(err) {
                    if (ERR(err, callback)) return;
                        callback(null);
                });
            });
        }, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }, function(err) {
        if (ERR(err, callback)) return;

        logger.debug('Deleting excess alternative groups for current assessment');
        var params = {
            assessment_id: assessmentId,
            last_number: iAlternativeGroup,
        };
        sqldb.query(sql.delete_excess_alternative_groups, params, function(err, result) {
            if (ERR(err, callback)) return;

            logger.debug('Soft-deleting unused assessment questions for current assessment');
            var params = {
                assessment_id: assessmentId,
                keep_assessment_question_ids: assessmentQuestionIds,
            };
            sqldb.query(sql.soft_delete_unused_assessment_questions_in_assessment, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        });
    });
}

function syncAssessmentQuestion(qid, maxPoints, pointsList, initPoints, forceMaxPoints, triesPerVariant, iInAlternativeGroup, iAssessmentQuestion, assessmentId, alternative_group_id, courseInfo, questionDB, callback) {
    // Look up the ID of the question based on its QID
    const question = questionDB[qid];
    if (!question) {
        callback(new Error(`Invalid QID: ${qid}`));
        return;
    }
    const questionId = question.id;

    logger.debug('Syncing assessment question number ' + iAssessmentQuestion + ' with QID ' + qid);
    var params = {
        number: iAssessmentQuestion,
        max_points: maxPoints,
        points_list: pointsList,
        init_points: initPoints,
        force_max_points: forceMaxPoints,
        tries_per_variant: triesPerVariant,
        assessment_id: assessmentId,
        question_id: questionId,
        alternative_group_id: alternative_group_id,
        number_in_alternative_group: iInAlternativeGroup,
    };
    sqldb.queryOneRow(sql.insert_assessment_question, params, function(err, result) {
        if (ERR(err, callback)) return;
        callback(null, result.rows[0].id);
    });
}
