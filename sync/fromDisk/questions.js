const _ = require('lodash');
const sqldb = require('@prairielearn/prairielib/sql-db');

const logger = require('../../lib/logger');
const { safeAsync } = require('../../lib/async');
const perf = require('../performance')('question');

module.exports.sync = function(courseInfo, questionDB, jobLogger, callback) {
    safeAsync(async () => {
        logger.debug('Syncing questions');

        // Check for duplicate UUIDs within this course's questions
        _(questionDB)
            .groupBy('uuid')
            .each(function(questions, uuid) {
                if (questions.length > 1) {
                    const directories = questions.map(q => q.directory).join(', ');
                    throw new Error(`UUID ${uuid} is used in multiple questions: ${directories}`);
                }
            });

        // Preprocess questions into obects before sending them to the sproc
        // for syncing
        const questionsParam = Object.keys(questionDB).map(qid => {
            const q = questionDB[qid];

            let external_grading_files = null;
            if (q.externalGradingOptions) {
                const opts = q.externalGradingOptions;
                if (opts.files && opts.serverFilesCourse) {
                    throw new Error(`Question ${qid} cannot use both externalGradingOptions.files and externalGradingOptions.serverFilesCourse`);
                } else if (opts.files) {
                    jobLogger.warn(`WARNING: Question ${qid} uses externalGradingOptions.files, which will be deprecated in favor of externalGradingOptions.serverFilesCourse`);
                    external_grading_files = opts.files;
                } else if (opts.serverFilesCourse) {
                    external_grading_files = opts.serverFilesCourse;
                }
            }

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
                uuid: q.uuid,
                qid: qid,
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
                external_grading_files: external_grading_files,
                external_grading_entrypoint: (q.externalGradingOptions && q.externalGradingOptions.entrypoint),
                external_grading_timeout: (q.externalGradingOptions && q.externalGradingOptions.timeout),
                external_grading_enable_networking: (q.externalGradingOptions && q.externalGradingOptions.enableNetworking),
            };
        });

        const syncQuestionsParams = [
            JSON.stringify(questionsParam),
            courseInfo.courseId,
        ];

        perf.start('syncQuestionsSproc');
        const syncQuestionsResult = await sqldb.callOneRowAsync('sync_questions', syncQuestionsParams);
        perf.end('syncQuestionsSproc');

        // Associate the new IDs with their respective questions; future
        // states of the sync process will need these
        const newQuestionIds = syncQuestionsResult.rows[0].new_question_ids;
        questionsParam.forEach((questionParam, index) => {
            questionDB[questionParam.qid].id = newQuestionIds[index];
        });
    }, callback);
}
