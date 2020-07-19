// @ts-check
const sqldb = require('@prairielearn/prairielib/sql-db');

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
        dependencies: q.dependencies || {},
        workspace_image: (q.workspaceOptions && q.workspaceOptions.image),
        workspace_port: (q.workspaceOptions && q.workspaceOptions.port),
        workspace_args: (q.workspaceOptions && q.workspaceOptions.args),
        workspace_graded_files: (q.workspaceOptions && q.workspaceOptions.gradedFiles),
    };
}

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @returns {Promise<{ [qid: string]: any }>}
 */
module.exports.sync = async function(courseId, courseData) {
    const questionParams = Object.entries(courseData.questions).map(([qid, question]) => {
        return JSON.stringify({
            qid,
            uuid: question.uuid,
            errors: infofile.stringifyErrors(question),
            warnings: infofile.stringifyWarnings(question),
            data: getParamsForQuestion(question.data),
        });
    });

    const params = [
        questionParams,
        courseId,
    ];

    perf.start('sproc:sync_questions');
    const result = await sqldb.callOneRowAsync('sync_questions', params);
    perf.end('sproc:sync_questions');

    /** @type {[string, any][]} */
    const newQuestions = result.rows[0].new_questions_json;
    return newQuestions;
};
