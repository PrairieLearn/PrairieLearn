//@ts-check
const _ = require('lodash');
import * as error from '@prairielearn/error';
import { saveAndGradeSubmission, saveSubmission } from './grading';
import { idsEqual } from './id';
import { selectVariantById } from '../models/variant';

export async function validateVariantAgainstQuestion(unsafe_variant_id, question_id) {
  const variant = await selectVariantById(unsafe_variant_id);
  if (variant == null || !idsEqual(variant.question_id, question_id)) {
    throw error.make(
      400,
      `Client-provided variant ID ${unsafe_variant_id} is not valid for question ID ${question_id}.`,
    );
  }
  return variant;
}

/**
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
export async function processSubmission(req, res) {
  let variant_id, submitted_answer;
  if (res.locals.question.type === 'Freeform') {
    variant_id = req.body.__variant_id;
    submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
  } else {
    if (!req.body.postData) {
      throw error.make(400, 'No postData');
    }
    let postData;
    try {
      postData = JSON.parse(req.body.postData);
    } catch (e) {
      throw error.make(400, 'JSON parse failed on body.postData');
    }
    variant_id = postData.variant ? postData.variant.id : null;
    submitted_answer = postData.submittedAnswer;
  }
  const submission = {
    variant_id: variant_id,
    auth_user_id: res.locals.authn_user.user_id,
    submitted_answer: submitted_answer,
  };
  const variant = await validateVariantAgainstQuestion(
    submission.variant_id,
    res.locals.question.id,
  );
  if (req.body.__action === 'grade') {
    const overrideRateLimits = true;
    await saveAndGradeSubmission(
      submission,
      variant,
      res.locals.question,
      res.locals.course,
      overrideRateLimits,
    );
    return submission.variant_id;
  } else if (req.body.__action === 'save') {
    await saveSubmission(submission, variant, res.locals.question, res.locals.course);
    return submission.variant_id;
  } else {
    throw error.make(400, `unknown __action: ${req.body.__action}`);
  }
}
