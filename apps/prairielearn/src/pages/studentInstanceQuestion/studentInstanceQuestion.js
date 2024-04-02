// @ts-check
import { promisify } from 'util';
import * as _ from 'lodash';
import * as express from 'express';
const asyncHandler = require('express-async-handler');

import * as error from '@prairielearn/error';

const LogPageView = require('../../middlewares/logPageView');
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render';
import { gradeAssessmentInstance } from '../../lib/assessment';
import { setQuestionCopyTargets } from '../../lib/copy-question';
import { getQuestionGroupPermissions } from '../../lib/groups';
import { uploadFile, deleteFile } from '../../lib/file-store';
import { idsEqual } from '../../lib/id';
import { insertIssue } from '../../lib/issues';
import { processSubmission, validateVariantAgainstQuestion } from '../../lib/question-submission';

const logPageView = promisify(LogPageView('studentInstanceQuestion'));
const router = express.Router();

/**
 * Get a validated variant ID from a request, or throw an exception.
 *
 * This function assumes req.body.__variant_id has been sent by the client, but
 * it is currently untrusted. We check that it is a valid variant_id and
 * belongs to the authorized res.locals.instance_question_id and return it if
 * everything is ok. If anything is invalid or unauthorized, we throw an
 * exception.
 *
 * @param {express.Request} req The request object
 * @param {express.Response} res The response object
 * @returns {Promise<string>} The validated variant ID
 */
async function getValidVariantId(req, res) {
  return (
    await validateVariantAgainstQuestion(
      req.body.__variant_id,
      res.locals.question.id,
      res.locals.instance_question.id,
    )
  ).id;
}

async function processFileUpload(req, res) {
  if (!res.locals.assessment_instance.open) throw error.make(403, `Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw error.make(403, `This assessment is not accepting submissions at this time.`);
  }
  if (!req.file) {
    throw error.make(400, 'No file uploaded');
  }
  await uploadFile({
    display_filename: req.file.originalname,
    contents: req.file.buffer,
    type: 'student_upload',
    assessment_id: res.locals.assessment.id,
    assessment_instance_id: res.locals.assessment_instance.id,
    instance_question_id: res.locals.instance_question.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
  });
  return await getValidVariantId(req, res);
}

async function processTextUpload(req, res) {
  if (!res.locals.assessment_instance.open) throw error.make(403, `Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw error.make(403, `This assessment is not accepting submissions at this time.`);
  }
  await uploadFile({
    display_filename: req.body.filename,
    contents: Buffer.from(req.body.contents),
    type: 'student_upload',
    assessment_id: res.locals.assessment.id,
    assessment_instance_id: res.locals.assessment_instance.id,
    instance_question_id: res.locals.instance_question.id,
    user_id: res.locals.user.user_id,
    authn_user_id: res.locals.authn_user.user_id,
  });
  return await getValidVariantId(req, res);
}

async function processDeleteFile(req, res) {
  if (!res.locals.assessment_instance.open) throw error.make(403, `Assessment is not open`);
  if (!res.locals.authz_result.active) {
    throw error.make(403, `This assessment is not accepting submissions at this time.`);
  }

  // Check the requested file belongs to the current instance question
  const validFiles =
    res.locals.file_list?.filter((file) => idsEqual(file.id, req.body.file_id)) ?? [];
  if (validFiles.length === 0) throw error.make(404, `No such file_id: ${req.body.file_id}`);
  const file = validFiles[0];

  if (file.type !== 'student_upload') {
    throw error.make(403, `Cannot delete file type ${file.type} for file_id=${file.id}`);
  }

  await deleteFile(file.id, res.locals.authn_user.user_id);

  return await getValidVariantId(req, res);
}

async function processIssue(req, res) {
  if (!res.locals.assessment.allow_issue_reporting) {
    throw error.make(403, 'Issue reporting not permitted for this assessment');
  }
  const description = req.body.description;
  if (!_.isString(description) || description.length === 0) {
    throw error.make(400, 'A description of the issue must be provided');
  }

  const variantId = await getValidVariantId(req, res);
  await insertIssue({
    variantId,
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
}

async function validateAndProcessSubmission(req, res) {
  if (!res.locals.assessment_instance.open) {
    throw error.make(400, 'assessment_instance is closed');
  }
  if (!res.locals.instance_question.open) {
    throw error.make(400, 'instance_question is closed');
  }
  if (!res.locals.authz_result.active) {
    throw error.make(400, 'This assessment is not accepting submissions at this time.');
  }
  if (
    res.locals.assessment.group_config?.has_roles &&
    !res.locals.instance_question.group_role_permissions.can_submit
  ) {
    throw error.make(
      403,
      'Your current group role does not give you permission to submit to this question.',
    );
  }
  return await processSubmission(req, res, true);
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_result.authorized_edit) {
      throw error.make(403, 'Not authorized');
    }

    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      if (res.locals.assessment.type === 'Exam') {
        if (res.locals.authz_result.time_limit_expired) {
          throw error.make(403, 'Time limit is expired, please go back and finish your assessment');
        }
        if (req.body.__action === 'grade' && !res.locals.assessment.allow_real_time_grading) {
          throw error.make(403, 'Real-time grading is not allowed for this assessment');
        }
      }
      const variant_id = await validateAndProcessSubmission(req, res);
      if (res.locals.assessment.type === 'Exam') {
        res.redirect(req.originalUrl);
      } else {
        res.redirect(
          `${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/?variant_id=${variant_id}`,
        );
      }
    } else if (req.body.__action === 'timeLimitFinish') {
      if (res.locals.assessment.type !== 'Exam') {
        throw error.make(400, 'Only exams have a time limit');
      }
      // Only close if the timer expired due to time limit, not for access end
      if (!res.locals.assessment_instance_time_limit_expired) {
        return res.redirect(req.originalUrl);
      }

      const requireOpen = true;
      const closeExam = true;
      const overrideGradeRate = false;
      await gradeAssessmentInstance(
        res.locals.assessment_instance.id,
        res.locals.authn_user.user_id,
        requireOpen,
        closeExam,
        overrideGradeRate,
        res.locals.client_fingerprint_id,
      );
      res.redirect(
        `${res.locals.urlPrefix}/assessment_instance/${res.locals.assessment_instance.id}?timeLimitExpired=true`,
      );
    } else if (req.body.__action === 'attach_file') {
      const variant_id = await processFileUpload(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/?variant_id=${variant_id}`,
      );
    } else if (req.body.__action === 'attach_text') {
      const variant_id = await processTextUpload(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/?variant_id=${variant_id}`,
      );
    } else if (req.body.__action === 'delete_file') {
      const variant_id = await processDeleteFile(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/?variant_id=${variant_id}`,
      );
    } else if (req.body.__action === 'report_issue') {
      const variant_id = await processIssue(req, res);
      res.redirect(
        `${res.locals.urlPrefix}/instance_question/${res.locals.instance_question.id}/?variant_id=${variant_id}`,
      );
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id/submission/:submission_id',
  asyncHandler(async (req, res) => {
    const { submissionPanel } = await renderPanelsForSubmission({
      submission_id: req.params.submission_id,
      question_id: res.locals.question.id,
      instance_question_id: res.locals.instance_question.id,
      variant_id: req.params.variant_id,
      urlPrefix: res.locals.urlPrefix,
      questionContext: null,
      csrfToken: null,
      authorizedEdit: null,
      renderScorePanels: false,
    });
    res.send({ submissionPanel });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const variant_id =
      res.locals.assessment.type === 'Exam' || typeof req.query.variant_id !== 'string'
        ? null
        : req.query.variant_id;
    await getAndRenderVariant(variant_id, null, res.locals);

    await logPageView(req, res);
    await setQuestionCopyTargets(res);

    if (
      res.locals.assessment.group_config?.has_roles &&
      !res.locals.authz_data.has_course_instance_permission_view
    ) {
      if (res.locals.instance_question_info.prev_instance_question.id != null) {
        res.locals.prev_instance_question_role_permissions = await getQuestionGroupPermissions(
          res.locals.instance_question_info.prev_instance_question.id,
          res.locals.assessment_instance.group_id,
          res.locals.authz_data.user.user_id,
        );
      }
      if (res.locals.instance_question_info.next_instance_question.id) {
        res.locals.next_instance_question_role_permissions = await getQuestionGroupPermissions(
          res.locals.instance_question_info.next_instance_question.id,
          res.locals.assessment_instance.group_id,
          res.locals.authz_data.user.user_id,
        );
      }
    }
    setRendererHeader(res);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
