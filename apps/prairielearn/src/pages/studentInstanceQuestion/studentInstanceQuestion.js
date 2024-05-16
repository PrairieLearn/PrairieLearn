// @ts-check
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import _ from 'lodash';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { gradeAssessmentInstance } from '../../lib/assessment.js';
import { setQuestionCopyTargets } from '../../lib/copy-question.js';
import { IdSchema } from '../../lib/db-types.js';
import { uploadFile, deleteFile } from '../../lib/file-store.js';
import { getQuestionGroupPermissions } from '../../lib/groups.js';
import { idsEqual } from '../../lib/id.js';
import { insertIssue } from '../../lib/issues.js';
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render.js';
import {
  processSubmission,
  validateVariantAgainstQuestion,
} from '../../lib/question-submission.js';
import { logPageView } from '../../middlewares/logPageView.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

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
  if (!res.locals.assessment_instance.open) {
    throw new error.HttpStatusError(403, `Assessment is not open`);
  }
  if (!res.locals.authz_result.active) {
    throw new error.HttpStatusError(
      403,
      `This assessment is not accepting submissions at this time.`,
    );
  }
  if (!req.file) {
    throw new error.HttpStatusError(400, 'No file uploaded');
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
  if (!res.locals.assessment_instance.open) {
    throw new error.HttpStatusError(403, `Assessment is not open`);
  }
  if (!res.locals.authz_result.active) {
    throw new error.HttpStatusError(
      403,
      `This assessment is not accepting submissions at this time.`,
    );
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
  if (!res.locals.assessment_instance.open) {
    throw new error.HttpStatusError(403, `Assessment is not open`);
  }
  if (!res.locals.authz_result.active) {
    throw new error.HttpStatusError(
      403,
      `This assessment is not accepting submissions at this time.`,
    );
  }

  // Check the requested file belongs to the current instance question
  const validFiles =
    res.locals.file_list?.filter((file) => idsEqual(file.id, req.body.file_id)) ?? [];
  if (validFiles.length === 0) {
    throw new error.HttpStatusError(404, `No such file_id: ${req.body.file_id}`);
  }
  const file = validFiles[0];

  if (file.type !== 'student_upload') {
    throw new error.HttpStatusError(
      403,
      `Cannot delete file type ${file.type} for file_id=${file.id}`,
    );
  }

  await deleteFile(file.id, res.locals.authn_user.user_id);

  return await getValidVariantId(req, res);
}

async function processIssue(req, res) {
  if (!res.locals.assessment.allow_issue_reporting) {
    throw new error.HttpStatusError(403, 'Issue reporting not permitted for this assessment');
  }
  const description = req.body.description;
  if (!_.isString(description) || description.length === 0) {
    throw new error.HttpStatusError(400, 'A description of the issue must be provided');
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
    throw new error.HttpStatusError(400, 'assessment_instance is closed');
  }
  if (!res.locals.instance_question.open) {
    throw new error.HttpStatusError(400, 'instance_question is closed');
  }
  if (!res.locals.authz_result.active) {
    throw new error.HttpStatusError(
      400,
      'This assessment is not accepting submissions at this time.',
    );
  }
  if (
    res.locals.assessment.group_config?.has_roles &&
    !res.locals.instance_question.group_role_permissions.can_submit
  ) {
    throw new error.HttpStatusError(
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
      throw new error.HttpStatusError(403, 'Not authorized');
    }

    if (req.body.__action === 'grade' || req.body.__action === 'save') {
      if (res.locals.assessment.type === 'Exam') {
        if (res.locals.authz_result.time_limit_expired) {
          throw new error.HttpStatusError(
            403,
            'Time limit is expired, please go back and finish your assessment',
          );
        }
        if (req.body.__action === 'grade' && !res.locals.assessment.allow_real_time_grading) {
          throw new error.HttpStatusError(
            403,
            'Real-time grading is not allowed for this assessment',
          );
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
        throw new error.HttpStatusError(400, 'Only exams have a time limit');
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
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/variant/:variant_id(\\d+)/submission/:submission_id(\\d+)',
  asyncHandler(async (req, res) => {
    const { submissionPanel, extraHeadersHtml } = await renderPanelsForSubmission({
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
    res.send({ submissionPanel, extraHeadersHtml });
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let variant_id =
      res.locals.assessment.type === 'Exam' || typeof req.query.variant_id !== 'string'
        ? null
        : req.query.variant_id;

    const isAssessmentAvailable =
      res.locals.assessment_instance.open && res.locals.authz_result.active;

    if (variant_id === null && !isAssessmentAvailable) {
      // We can't generate a new variant in this case, so we
      // fetch and display the most recent non-broken variant.
      // If no such variant exists, we tell the user that a new variant
      // cannot be generated.
      const last_variant_id = await sqldb.queryOptionalRow(
        sql.select_last_variant_id,
        { instance_question_id: res.locals.instance_question.id },
        IdSchema,
      );
      if (last_variant_id == null) {
        res.locals.no_variant_exists = true;
        res.status(403).render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
        return;
      }

      // For exams, we leave variant_id as null; getAndRenderVariant will handle it.
      if (res.locals.assessment.type === 'Homework') {
        variant_id = last_variant_id;
      }
    }
    await getAndRenderVariant(variant_id, null, res.locals);

    await logPageView('studentInstanceQuestion', req, res);
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
    res.render(import.meta.filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
