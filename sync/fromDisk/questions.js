var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var logger = require('../../lib/logger');
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
        try {
            callback(await func());
        } catch (err) {
            callback(err);
        }
    });
};

module.exports.sync = function(courseInfo, questionDB, jobLogger, callback) {
    safeAsync(async () => {
        logger.debug('Syncing questions');

        // Check for duplicate UUIDs within this course's questions
        _(questionDB)
            .groupBy('uuid')
            .each(function(questions, uuid) {
                if (questions.length > 1) {
                    const directories = questions.map(q => q.directory).join();
                    throw new Error(`UUID ${uuid} is used in multiple questions: ${directories}`);
                }
            });

        // Check if any of the UUIDs in this course's questions are in use in any other course
        const params = [
            JSON.stringify(Object.values(questionDB).map(q => q.uuid)),
            courseInfo.courseId,
        ];

        start('questionsDuplicateUUID');
        const duplicateUuidResult = await asyncCallOneRow('sync_check_duplicate_question_uuids', params);
        end('questionsDuplicateUUID');

        const duplicateUUID = duplicateUuidResult.rows[0].duplicate_uuid;
        if (duplicateUUID) {
            // Determine the corresponding QID to provide a useful error
            const qid = Object.keys(questionDB).find((qid) => questionDB[qid].uuid === duplicateUUID);
            throw new Error(`UUID ${duplicateUUID} from question ${qid} is already in use by a different course`);
        }

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

        // Sync the questions to the DB. This will create/update all questions,
        // soft-delete any unused questions, and ensure that all questions have
        // assigned numbers (TODO clarify what these numbers are?)

        const syncQuestionsParams = [
            JSON.stringify(questionsParam),
            courseInfo.courseId,
        ];

        start('syncQuestionsSproc');
        const syncQuestionsResult = await asyncCallOneRow('sync_questions', syncQuestionsParams);
        end('syncQuestionsSproc');

        // Associate the new IDs with their respective questions; future
        // states of the sync process will need these
        const newQuestionIds = syncQuestionsResult.rows[0].new_question_ids;
        questionsParam.forEach((questionParam, index) => {
            questionDB[questionParam.qid].id = newQuestionIds[index];
        });
    }, callback);
}
