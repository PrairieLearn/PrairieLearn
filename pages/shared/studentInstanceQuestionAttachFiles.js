const util = require('util');
const _ = require('lodash');

const fileStore = require('../../lib/file-store');
const sqldb = require('@prairielearn/prairielib/sql-db');

module.exports = {
    async processQuestionFileUpload(req, res) {
        await fileStore.upload(req.file.originalname, req.file.buffer, 'student_upload', res.locals.assessment_instance.id, res.locals.instance_question.id, res.locals.user.user_id, res.locals.authn_user.user_id);
        const variant_id = req.body.__variant_id;
        await sqldb.callOneRowAsync('variants_ensure_instance_question', [variant_id, res.locals.instance_question.id]);
        return variant_id;
    },

    async processQuestionTextUpload(req, res) {
        await fileStore.upload(req.body.filename, Buffer.from(req.body.contents), 'student_upload', res.locals.assessment_instance.id, res.locals.instance_question.id, res.locals.user.user_id, res.locals.authn_user.user_id);
        const variant_id = req.body.__variant_id;
        await sqldb.callOneRowAsync('variants_ensure_instance_question', [variant_id, res.locals.instance_question.id]);
        return variant_id;
    },

    async processQuestionDeleteFile(req, res) {
        // Check the requested file belongs to the current instance question
        // and deletion is allowed.
        const l = _.filter(res.locals.file_list, file => (file.id == req.body.file_id));
        if (l.length == 0) throw new Error(`No such file_id: ${req.body.file_id}`);
        const file = l[0];
        if (file.type != 'student_upload') throw new Error(`Cannot delete file type ${file.type} for file_id=${file.id}`);

        await fileStore.delete(file.id, res.locals.authn_user.user_id);

        const variant_id = req.body.__variant_id;
        await sqldb.callOneRowAsync('variants_ensure_instance_question', [variant_id, res.locals.instance_question.id]);
        return variant_id;
    },
};
