const ERR = require('async-stacktrace');
const _ = require('lodash');
const { callbackify } = require('util');
const sqldb = require('@prairielearn/prairielib/sql-db');
const fs = require('fs-extra');

const { validateHtml } = require('../../lib/html-validate');
const logger = require('../../lib/logger');
const perf = require('../performance')('question');

module.exports.sync = function(courseInfo, questionDB, courseDir, jobLogger, callback) {
    callbackify(async () => {
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

        var validateCount = 1;
        // Preprocess questions into obects before sending them to the sproc
        // for syncing
        const questionsParam = Object.keys(questionDB).map(qid => {
            const q = questionDB[qid];

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

            if (q.type == 'v3') {
                var htmlFilename = `${courseDir}/questions/${qid}/question.html`;
                fs.readFile(htmlFilename, { encoding: 'utf8' }, (err, rawFile) => {
                    if (err) {
                        console.log(err);
                    }
                    try {
                        validateHtml(rawFile);
                    }
                    catch (e) {
                        //jobLogger.info(htmlFilename);
                        jobLogger.info(validateCount + '. ' + htmlFilename);
                        jobLogger.info(e.message);
                        jobLogger.info('This is a warning only; after January 2020, questions will be required to validate.')
                        //console.log(htmlFilename, e);
                        validateCount++;
                    }
                });
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
                external_grading_files: (q.externalGradingOptions && q.externalGradingOptions.serverFilesCourse),
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
        const newQuestions = syncQuestionsResult.rows[0].new_questions_json;
        newQuestions.forEach((idMapping) => {
            questionDB[idMapping.qid].id = idMapping.id;
        });
    })(callback);
}
