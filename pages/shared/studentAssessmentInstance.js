const _ = require('lodash');
const sqldb = require('@prairielearn/prairielib/sql-db');

const fileStore = require('../../lib/file-store');

module.exports = {
    async processFileUpload(req, res) {
        if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
        await fileStore.upload(req.file.originalname, req.file.buffer, 'student_upload', res.locals.assessment_instance.id, null, res.locals.user.user_id, res.locals.authn_user.user_id);
    },

    async processTextUpload(req, res) {
        if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
        await fileStore.upload(req.body.filename, Buffer.from(req.body.contents), 'student_upload', res.locals.assessment_instance.id, null, res.locals.user.user_id, res.locals.authn_user.user_id);
    },

    async processDeleteFile(req, res) {
        if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);

        // Check the requested file belongs to the current assessment instance
        const l = _.filter(res.locals.file_list, file => (file.id == req.body.file_id));
        if (l.length == 0) throw new Error(`No such file_id: ${req.body.file_id}`);
        const file = l[0];

        if (file.type != 'student_upload') throw new Error(`Cannot delete file type ${file.type} for file_id=${file.id}`);

        await fileStore.delete(file.id, res.locals.authn_user.user_id);
    },
};
