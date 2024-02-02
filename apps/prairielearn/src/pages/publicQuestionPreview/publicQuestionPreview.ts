import ERR = require('async-stacktrace');
import { Router } from 'express';
import * as async from 'async';
import * as path from 'path';
import * as error from '@prairielearn/error';
import { z } from 'zod';

import { selectQuestionById } from '../../models/question';
import { selectCourseById } from '../../models/course';
import { processSubmission } from '../../lib/questionPreview';
import { IdSchema, UserSchema } from '../../lib/db-types';
import LogPageView = require('../../middlewares/logPageView');
import {
  getAndRenderVariant,
  renderPanelsForSubmission,
  setRendererHeader,
} from '../../lib/question-render';

const logPageView = LogPageView(path.basename(__filename, '.ts'));

const router = Router({ mergeParams: true });

async function setLocals(req, res) {
  res.locals.user = UserSchema.parse(res.locals.authn_user);
  res.locals.authz_data = { user: res.locals.user };
  res.locals.course = await selectCourseById(req.params.course_id);
  res.locals.question = await selectQuestionById(req.params.question_id);
  if (
    !res.locals.question.shared_publicly ||
    res.locals.course.id !== res.locals.question.course_id
  ) {
    throw error.make(404, 'Not Found');
  }
  return;
}

router.post('/', function (req, res, next) {
  setLocals(req, res)
    .then(() => {
      if (req.body.__action === 'grade' || req.body.__action === 'save') {
        processSubmission(req, res, function (err, variant_id) {
          if (ERR(err, next)) return;
          res.redirect(
            res.locals.urlPrefix +
              '/question/' +
              res.locals.question.id +
              '/preview/?variant_id=' +
              variant_id,
          );
        });
      } else if (req.body.__action === 'report_issue') {
        // we currently don't report issues for public facing previews
        res.redirect(req.originalUrl);
      } else {
        next(
          error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
          }),
        );
      }
    })
    .catch((err) => next(err));
});

router.get('/variant/:variant_id/submission/:submission_id', function (req, res, next) {
  setLocals(req, res)
    .then(async () => {
      const { submissionPanel } = await renderPanelsForSubmission(
        req.params.submission_id,
        res.locals.question.id,
        null, // instance_question_id,
        req.params.variant_id,
        res.locals.urlPrefix,
        null, // questionContext
        null, // csrfToken
        null, // authorizedEdit
        false, // renderScorePanels
      );
      res.send({ submissionPanel });
    })
    .catch((err) => next(err));
});

router.get('/', function (req, res, next) {
  setLocals(req, res)
    .then(() => {
      const variant_seed = req.query.variant_seed ? z.string().parse(req.query.variant_seed) : null;
      const variant_id = req.query.variant_id ? IdSchema.parse(req.query.variant_id) : null;
      return async.series(
        [
          async () => {
            await getAndRenderVariant(variant_id, variant_seed, res.locals);
          },
          (callback) => {
            logPageView(req, res, (err) => {
              if (ERR(err, next)) return;
              callback(null);
            });
          },
        ],
        (err) => {
          if (ERR(err, next)) return;
          setRendererHeader(res);
          res.render(__filename.replace(/\.(js|ts)$/, '.ejs'), res.locals);
        },
      );
    })
    .catch((err) => next(err));
});

export = router;
