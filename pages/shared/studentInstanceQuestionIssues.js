const ERR = require('async-stacktrace');
const _ = require('lodash');

const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {
    processIssue(req, res, callback) {
        if (!res.locals.assessment.allow_issue_reporting) return callback(new Error('Issue reporting not permitted for this assessment'));
        const description = req.body.description;
        if (!_.isString(description) || description.length == 0) {
            return callback(new Error('A description of the issue must be provided'));
        }

        const variant_id = req.body.__variant_id;
        sqldb.callOneRow('variants_ensure_instance_question', [variant_id, res.locals.instance_question.id], (err, _result) => {
            if (ERR(err, callback)) return;

            const course_data = _.pick(res.locals, ['variant', 'instance_question',
                'question', 'assessment_instance',
                'assessment', 'course_instance', 'course']);
            const params = [
                variant_id,
                description, // student message
                'student-reported issue', // instructor message
                true, // manually_reported
                true, // course_caused
                course_data,
                {}, // system_data
                res.locals.authn_user.user_id,
            ];
            sqldb.call('issues_insert_for_variant', params, (err) => {
                if (ERR(err, callback)) return;
                callback(null, variant_id);
            });
        });
    },
};
