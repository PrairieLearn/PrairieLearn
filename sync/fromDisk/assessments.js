const _ = require('lodash');
const { callbackify } = require('util');
const naturalSort = require('javascript-natural-sort');
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');

const config = require('../../lib/config');
const perf = require('../performance')('assessments');

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
        const allowIssueReporting = !!_.get(assessment, 'allowIssueReporting', true);
        const allowRealTimeGrading = !!_.get(assessment, 'allowRealTimeGrading', true);

        // Because of how Homework-type assessments work, we don't allow
        // real-time grading to be disabled for them.
        if (!allowRealTimeGrading && assessment.type === 'Homework') {
            throw new Error(`Assessment "${assessment.tid}" cannot disable real-time grading; that is only possible for Exam-type assessments.`);
        }

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
            allow_real_time_grading: allowRealTimeGrading,
            auto_close: !!_.get(assessment, 'autoClose', true),
            max_points: assessment.maxPoints,
            set_name: assessment.set,
            text: assessment.text,
            constant_question_value: !!_.get(assessment, 'constantQuestionValue', false),
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
                show_closed_assessment: !!_(accessRule).get('showClosedAssessment', true),
            };
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

        // Track which QIDs we've seen so we can detect duplicates
        const usedQIDs = new Set();
        function checkAndRecordQID(qid) {
            if (usedQIDs.has(qid)) {
                throw new Error(`Assessment "${assessment.tid}" uses question "${qid}" more than once.`);
            }
            usedQIDs.add(qid);
        }

        let alternativeGroupNumber = 0;
        let assessmentQuestionNumber = 0;
        assessmentParams.alternativeGroups = zones.map((zone) => {
            return zone.questions.map((question) => {
                if (!allowRealTimeGrading && Array.isArray(question.points)) {
                    throw new Error(`Assessment "${assessment.tid}" cannot specify an array of points for a question if real-time grading is disabled`);
                }
                let alternatives;
                if (_(question).has('alternatives')) {
                    if (_(question).has('id')) throw error.make(400, 'Cannot have both "id" and "alternatives" in one question', {question});
                    question.alternatives.forEach(a => checkAndRecordQID(a.id));
                    alternatives = _.map(question.alternatives, function(alternative) {
                        if (!allowRealTimeGrading && Array.isArray(alternative.points)) {
                            throw new Error(`Assessment "${assessment.tid}" cannot specify an array of points for an alternative if real-time grading is disabled`);
                        }
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
                    checkAndRecordQID(question.id);
                    alternatives = [
                        {
                            qid: question.id,
                            maxPoints: question.maxPoints,
                            points: question.points,
                            forceMaxPoints: _.has(question, 'forceMaxPoints') ? question.forceMaxPoints : false,
                            triesPerVariant: _.has(question, 'triesPerVariant') ? question.triesPerVariant : 1,
                        },
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
                            throw error.make(400, 'Must specify "points" for a question in an "Exam" assessment', {question});
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
                            throw error.make(400, 'Must specify "points" for a question in a "Homework" assessment', {question});
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
                    const question = questionDB[alternative.qid];
                    if (!question) {
                        throw new Error(`Invalid QID in assessment ${assessment.tid}: ${alternative.qid}`);
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
                    };

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
    };
}

module.exports.sync = function(courseInfo, courseInstance, questionDB, callback) {
    callbackify(async () => {
        const { assessmentDB } = courseInstance;
        // Assign an ordering to all assessments
        const assessmentList = Object.values(assessmentDB);
        assessmentList.sort((a, b) => naturalSort(String(a.number), String(b.number)));
        assessmentList.forEach((assessment, index) => assessment.order_by = index);

        // Check for duplicate UUIDs within the course instance's assessments
        _(assessmentDB)
            .groupBy('uuid')
            .each(function(assessments, uuid) {
                if (assessments.length > 1) {
                    const directories = assessments.map(a => a.directory).join(', ');
                    throw new Error(`UUID ${uuid} is used in multiple assessments: ${directories}`);
                }
            });

        const syncData = buildSyncData(courseInfo, courseInstance, questionDB);
        const syncParams = [
            JSON.stringify(syncData.assessments),
            syncData.course_id,
            syncData.course_instance_id,
            syncData.check_access_rules_exam_uuid,
        ];
        perf.start(`syncAssessments${courseInstance.courseInstanceId}Sproc`);
        await sqldb.callOneRowAsync('sync_assessments', syncParams);
        perf.end(`syncAssessments${courseInstance.courseInstanceId}Sproc`);
    })(callback);
};
