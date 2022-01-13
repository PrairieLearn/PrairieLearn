const _ = require('lodash');

const fileStore = require('../../lib/file-store');
const { idsEqual } = require('../../lib/id');

module.exports.processFileUpload = async (req, res) => {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }
  await fileStore.upload(
    req.file.originalname,
    req.file.buffer,
    'student_upload',
    res.locals.assessment_instance.id,
    null,
    res.locals.user.user_id,
    res.locals.authn_user.user_id
  );
};

module.exports.processTextUpload = async (req, res) => {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }
  await fileStore.upload(
    req.body.filename,
    Buffer.from(req.body.contents),
    'student_upload',
    res.locals.assessment_instance.id,
    null,
    res.locals.user.user_id,
    res.locals.authn_user.user_id
  );
};

module.exports.processDeleteFile = async (req, res) => {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }

  // Check the requested file belongs to the current assessment instance
  const validFiles = _.filter(res.locals.file_list, (file) => idsEqual(file.id, req.body.file_id));
  if (validFiles.length === 0) throw new Error(`No such file_id: ${req.body.file_id}`);
  const file = validFiles[0];

  if (file.type !== 'student_upload') {
    throw new Error(`Cannot delete file type ${file.type} for file_id=${file.id}`);
  }

  await fileStore.delete(file.id, res.locals.authn_user.user_id);
};
