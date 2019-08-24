const ERR = require('async-stacktrace');
const _ = require('lodash');
const sqldb = require('@prairielearn/prairielib/sql-db');

const fileStore = require('../../lib/file-store');

module.exports = {
    async getVariantId(req, res) {
        const variant_id = req.body.__variant_id;
        const params = [
            variant_id,
            res.locals.instance_question.id,
        ];
        await sqldb.callOneRowAsync('variants_ensure_instance_question', params);
        return variant_id;
    },

    async processFileUpload(req, res) {
        await fileStore.upload(req.file.originalname, req.file.buffer, 'student_upload', res.locals.assessment_instance.id, res.locals.instance_question.id, res.locals.user.user_id, res.locals.authn_user.user_id);
        const variant_id = await module.exports.getVariantId(req, res);
        return variant_id;
    },

    async processTextUpload(req, res) {
        await fileStore.upload(req.body.filename, Buffer.from(req.body.contents), 'student_upload', res.locals.assessment_instance.id, res.locals.instance_question.id, res.locals.user.user_id, res.locals.authn_user.user_id);
        const variant_id = await module.exports.getVariantId(req, res);
        return variant_id;
    },

    async processDeleteFile(req, res) {
        // Check the requested file belongs to the current instance question
        // and deletion is allowed.
        const l = _.filter(res.locals.file_list, file => (file.id == req.body.file_id));
        if (l.length == 0) throw new Error(`No such file_id: ${req.body.file_id}`);
        const file = l[0];
        if (file.type != 'student_upload') throw new Error(`Cannot delete file type ${file.type} for file_id=${file.id}`);

        await fileStore.delete(file.id, res.locals.authn_user.user_id);

        const variant_id = await module.exports.getVariantId(req, res);
        return variant_id;
    },

    async processIssue(req, res) {
        if (!res.locals.assessment.allow_issue_reporting) {
            throw new Error('Issue reporting not permitted for this assessment');
        }
        const description = req.body.description;
        if (!_.isString(description) || description.length == 0) {
            throw new Error('A description of the issue must be provided');
        }

        const variant_id = await module.exports.getVariantId(req, res);

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
        await sqldb.callAsync('issues_insert_for_variant', params);
        return variant_id;
    },
};
