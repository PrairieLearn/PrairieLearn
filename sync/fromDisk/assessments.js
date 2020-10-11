// @ts-check
const _ = require('lodash');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const config = require('../../lib/config');
const perf = require('../performance')('assessments');
const infofile = require('../infofile');

const sql = sqlLoader.loadSqlEquiv(__filename);

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
  * 
  * @param {import('../infofile').InfoFile<import('../course-db').Assessment>} assessmentInfoFile
  * @param {{ [qid: string]: any }} questionIds
  */
function getParamsForAssessment(assessmentInfoFile, questionIds) {
    if (infofile.hasErrors(assessmentInfoFile)) return null;
    const assessment = assessmentInfoFile.data;

    const allowIssueReporting = !!_.get(assessment, 'allowIssueReporting', true);
    const allowRealTimeGrading = !!_.get(assessment, 'allowRealTimeGrading', true);
    const requireHonorCode = !!_.get(assessment, 'requireHonorCode', true);

    const assessmentParams = {
        type: assessment.type,
        number: assessment.number,
        title: assessment.title,
        multiple_instance: assessment.multipleInstance ? true : false,
        shuffle_questions: assessment.shuffleQuestions ? true : false,
        allow_issue_reporting: allowIssueReporting,
        allow_real_time_grading: allowRealTimeGrading,
        require_honor_code: requireHonorCode,
        auto_close: !!_.get(assessment, 'autoClose', true),
        max_points: assessment.maxPoints,
        set_name: assessment.set,
        text: assessment.text,
        constant_question_value: !!_.get(assessment, 'constantQuestionValue', false),
        group_work: !!assessment.groupWork,
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
            show_closed_assessment: !!_.get(accessRule, 'showClosedAssessment', true),
            show_closed_assessment_score: !!_.get(accessRule, 'showClosedAssessmentScore', true),
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

    let alternativeGroupNumber = 0;
    let assessmentQuestionNumber = 0;
    assessmentParams.alternativeGroups = zones.map((zone) => {
        return zone.questions.map((question) => {
            /** @type {{ qid: string, maxPoints: number | number[], points: number | number[], forceMaxPoints: boolean, triesPerVariant: number }[]} */
            let alternatives;
            if (_(question).has('alternatives')) {
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
                alternatives = [{
                    qid: question.id,
                    maxPoints: question.maxPoints,
                    points: question.points,
                    forceMaxPoints: question.forceMaxPoints || false,
                    triesPerVariant: question.triesPerVariant || 1,
                }];
            }

            const normalizedAlternatives = alternatives.map(alternative => {
                if (assessment.type === 'Exam') {
                    const pointsList = Array.isArray(alternative.points) ? alternative.points : [alternative.points];
                    const maxPoints = Math.max(...pointsList);
                    return {
                        ...alternative,
                        // Exlude 'points' prop
                        points: undefined,
                        maxPoints,
                        pointsList,
                        initPoints: undefined,
                    };

                }
                if (assessment.type === 'Homework') {
                    const maxPoints = alternative.maxPoints || alternative.points;
                    const initPoints = alternative.points;
                    return {
                        ...alternative,
                        maxPoints,
                        initPoints,
                        pointsList: undefined,
                    };
                }
            });

            alternativeGroupNumber++;
            const alternativeGroupParams = {
                number: alternativeGroupNumber,
                number_choose: question.numberChoose,
            };

            alternativeGroupParams.questions = normalizedAlternatives.map((alternative, alternativeIndex) => {
                assessmentQuestionNumber++;
                const questionId = questionIds[alternative.qid];
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
}

/**
 * @param {any} courseId
 * @param {any} courseInstanceId
 * @param {{ [aid: string]: import('../infofile').InfoFile<import('../course-db').Assessment> }} assessments
 * @param {{ [qid: string]: any }} questionIds
 */
module.exports.sync = async function(courseId, courseInstanceId, assessments, questionIds) {
    if (config.checkAccessRulesExamUuid) {
        // UUID-based exam access rules are validated here instead of course-db.js
        // because we need to hit the DB to check for them; we can't validate based
        // solely on the data we're reading off disk.
        // Instead of checking for `infofile.hasErrors`, we check if data is null
        // so that we can still add errors for invalid access UUIDs even if something
        // else produced an error
        // To be efficient, we'll collect all UUIDs from all assessments and check for
        // their existence in a single sproc call. We'll store a reverse mapping from UUID
        // to exams to be able to efficiently add error information for missing UUIDs.
        /** @type {Set<string>} */
        const examUuids = new Set();
        /** @type {Map<string, string[]>} */
        const uuidAssessmentMap = new Map();
        Object.entries(assessments).forEach(([tid, assessment]) => {
            if (!assessment.data) return;
            (assessment.data.allowAccess || []).forEach(allowAccess => {
                const { examUuid } = allowAccess;
                if (examUuid) {
                    examUuids.add(examUuid);
                    let tids = uuidAssessmentMap.get(examUuid);
                    if (!tids) {
                        tids = [];
                        uuidAssessmentMap.set(examUuid, tids);
                    }
                    tids.push(tid);
                }
            });
        });

        const uuidsParams = { exam_uuids: JSON.stringify([...examUuids]) };
        const uuidsRes = await sqldb.queryAsync(sql.check_access_rules_exam_uuid, uuidsParams);
        uuidsRes.rows.forEach(({ uuid, uuid_exists }) => {
            if (!uuid_exists) {
                uuidAssessmentMap.get(uuid).forEach(tid => {
                    infofile.addError(assessments[tid], `examUuid "${uuid}" not found. Ensure you copied the correct UUID from the scheduler.`);
                });
            }
        });
    }
    const assessmentParams = Object.entries(assessments).map(([tid, assessment]) => {
        return JSON.stringify([
            tid,
            assessment.uuid,
            infofile.stringifyErrors(assessment),
            infofile.stringifyWarnings(assessment),
            getParamsForAssessment(assessment, questionIds),
        ]);
    });

    const params = [
        assessmentParams,
        courseId,
        courseInstanceId,
    ];
    perf.start('sproc:sync_assessments');
    const result = await sqldb.callOneRowAsync('sync_assessments', params);
    perf.end('sproc:sync_assessments');

    /** @type {[string, any][]} */
    const nameToIdMap = result.rows[0].name_to_id_map; // eslint-disable-line no-unused-vars
    // we don't use this here, but see questions.js for the format of this return value
};
