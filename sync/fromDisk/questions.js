// @ts-check
const _ = require('lodash');
const { callbackify, promisify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');
const uuidv4 = require('uuid/v4');

const infofile = require('../infofile');
const perf = require('../performance')('question');

/**
 * @param {import('../course-db').Question} q
 */
function getParamsForQuestion(q) {
    if (!q) return null;

    let partialCredit;
    if (q.partialCredit != null) {
        partialCredit = q.partialCredit;
    } else {
        if (q.type == 'v3') {
            partialCredit = true;
        } else {
            partialCredit = false;
        }
    }
    return {
        type: (q.type == 'v3') ? 'Freeform' : q.type,
        title: q.title,
        partial_credit: partialCredit,
        template_directory: q.template,
        options: q.options,
        client_files: q.clientFiles || [],
        topic: q.topic,
        grading_method: q.gradingMethod || 'Internal',
        single_variant: !!q.singleVariant,
        external_grading_enabled: (q.externalGradingOptions && q.externalGradingOptions.enabled),
        external_grading_image: (q.externalGradingOptions && q.externalGradingOptions.image),
        external_grading_files: (q.externalGradingOptions && q.externalGradingOptions.serverFilesCourse),
        external_grading_entrypoint: (q.externalGradingOptions && q.externalGradingOptions.entrypoint),
        external_grading_timeout: (q.externalGradingOptions && q.externalGradingOptions.timeout),
        external_grading_enable_networking: (q.externalGradingOptions && q.externalGradingOptions.enableNetworking),
    };
}

/**
 * Syncs only a single question's worth of info. Used for incremental syncs.
 * Should not be used in isolation; the corresponding method in syncFromDisk
 * will do a number of safety checks to make sure an incremental sync is safe
 * and fallback to a full sync if necessary.
 * 
 * Note that this function works significantly differently than syncing all
 * questions in the context of a full course sync. Normally, topics are synced
 * first (creating missing topics if needed), then questions are synced, then
 * finally tags are synced (creating missing tags if needed and associating
 * tags with questions as appropriate). Normally, it's more efficient to do
 * things like that. However, if we can reason about the scope of changes (as
 * we can when it comes to syncing a single question), we can avoid all the
 * round trips to the database and do everything (missing topic creation,
 * missing tag creation, and question updating) in a single sproc call.
 */
module.exports.syncSingleQuestion = async function(courseDir, questionInfo, jobLogger) {
    const questionParam = getParamsForQuestion(questionInfo);
    // We need to add tags too - these are skipped for a normal full sync
    questionParam.tags = questionInfo.tags || [];
    const params = [
        JSON.stringify(questionParam),
        courseDir,
    ];
    await sqldb.callAsync('sync_single_question', params);
}

/**
 * @param {any} courseInfo
 * @param {any} questionDB
 * @param {any} jobLogger
 * @param {(err: Error | null | undefined) => void} callback
 */
module.exports.sync = function(courseInfo, questionDB, jobLogger, callback) {
    callbackify(async () => {
        // Check for duplicate UUIDs within this course's questions
        _(questionDB)
            .groupBy('uuid')
            .each(function(questions, uuid) {
                if (questions.length > 1) {
                    const directories = questions.map(q => q.directory).join(', ');
                    throw new Error(`UUID ${uuid} is used in multiple questions: ${directories}`);
                }
            });

        const questionsParam = Object.values(questionDB).map(getParamsForQuestion);
        const syncQuestionsParams = [
            JSON.stringify(questionsParam),
            courseInfo.courseId,
        ];

        perf.start('syncQuestionsSproc');
        const syncQuestionsResult = await sqldb.callOneRowAsync('sync_questions', syncQuestionsParams);
        perf.end('syncQuestionsSproc');

        // Associate the new IDs with their respective questions; future
        // states of the sync process will need these
        const newQuestions = syncQuestionsResult.rows[0].new_questions_json;
        newQuestions.forEach((idMapping) => {
            questionDB[idMapping.qid].id = idMapping.id;
        });
    })(callback);
}

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ [qid: string]: any }>}
 */
module.exports.syncNew = async function(courseId, courseData) {
    const questionParams = Object.entries(courseData.questions).map(([qid, question]) => {
        return JSON.stringify([
            qid,
            question.uuid,
            infofile.stringifyErrors(question),
            infofile.stringifyWarnings(question),
            getParamsForQuestion(question.data),
        ]);
    });

    const params = [
        questionParams,
        courseId,
    ];
    
    perf.start('syncQuestionsSprocNew');
    const result = await sqldb.callOneRowAsync('sync_questions_new', params);
    perf.end('syncQuestionsSprocNew');

    /** @type {[string, any][]} */
    const newQuestions = result.rows[0].new_questions_json;
    return newQuestions.reduce((acc, [qid, id]) => {
        acc[qid] = id;
        return acc;
    }, {});
}
