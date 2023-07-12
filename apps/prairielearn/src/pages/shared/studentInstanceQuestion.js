const _ = require('lodash');
const sqldb = require('@prairielearn/postgres');
const error = require('@prairielearn/error');

const fileStore = require('../../lib/file-store');
const { idsEqual } = require('../../lib/id');
const issues = require('../../lib/issues');

/*
 * Get a validated variant_id from a request, or throw an exception.
 *
 * This function assumes req.body.__variant_id has been sent by the client, but
 * it is currently untrusted. We check that it is a valid variant_id and
 * belongs to the authorized res.locals.instance_question_id and return it if
 * everything is ok. If anything is invalid or unauthorized, we throw an
 * exception.
 */
module.exports.getValidVariantId = async (req, res) => {
  const variant_id = req.body.__variant_id;
  const params = [variant_id, res.locals.instance_question.id];
  try {
    await sqldb.callOneRowAsync('variants_ensure_instance_question', params);
  } catch (e) {
    throw new Error(
      `Client-provided __variant_id "${req.body.__variant_id}" does not belong to the authorized instance_question_id "${res.locals.instance_question_id}"`,
    );
  }
  return variant_id;
};

module.exports.processFileUpload = async (req, res) => {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }
  if (!req.file) {
    throw error.make(400, 'No file uploaded');
  }
  await fileStore.upload(
    req.file.originalname,
    req.file.buffer,
    'student_upload',
    res.locals.assessment_instance.id,
    res.locals.instance_question.id,
    res.locals.user.user_id,
    res.locals.authn_user.user_id,
  );
  const variant_id = await module.exports.getValidVariantId(req, res);
  return variant_id;
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
    res.locals.instance_question.id,
    res.locals.user.user_id,
    res.locals.authn_user.user_id,
  );
  const variant_id = await module.exports.getValidVariantId(req, res);
  return variant_id;
};

module.exports.processDeleteFile = async (req, res) => {
  if (!res.locals.assessment_instance.open) throw new Error(`Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw new Error(`This assessment is not accepting submissions at this time.`);
  }

  // Check the requested file belongs to the current instance question
  const validFiles = _.filter(res.locals.file_list, (file) => idsEqual(file.id, req.body.file_id));
  if (validFiles.length === 0) throw new Error(`No such file_id: ${req.body.file_id}`);
  const file = validFiles[0];

  if (file.type !== 'student_upload') {
    throw new Error(`Cannot delete file type ${file.type} for file_id=${file.id}`);
  }

  await fileStore.delete(file.id, res.locals.authn_user.user_id);

  const variant_id = await module.exports.getValidVariantId(req, res);
  return variant_id;
};

module.exports.processIssue = async (req, res) => {
  if (!res.locals.assessment.allow_issue_reporting) {
    throw new Error('Issue reporting not permitted for this assessment');
  }
  const description = req.body.description;
  if (!_.isString(description) || description.length === 0) {
    throw error.make(400, 'A description of the issue must be provided');
  }

  const variantId = await module.exports.getValidVariantId(req, res);
  await issues.insertIssue({
    variantId: variantId,
    studentMessage: description,
    instructorMessage: 'student-reported issue',
    manuallyReported: true,
    courseCaused: true,
    courseData: _.pick(res.locals, [
      'variant',
      'instance_question',
      'question',
      'assessment_instance',
      'assessment',
      'course_instance',
      'course',
    ]),
    systemData: {},
    authnUserId: res.locals.authn_user.user_id,
  });
  return variantId;
};
