import * as path from 'path';

import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { generateSignedToken } from '@prairielearn/signed-token';

import { config } from '../../lib/config.js';
import { copyQuestionBetweenCourses } from '../../lib/copy-question.js';
import { IdSchema } from '../../lib/db-types.js';
import {
  QuestionRenameEditor,
  QuestionDeleteEditor,
  QuestionCopyEditor,
} from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { httpPrefixForCourseRepo } from '../../lib/github.js';
import { idsEqual } from '../../lib/id.js';
import { startTestQuestion } from '../../lib/question-testing.js';
import { encodePath } from '../../lib/uri-util.js';
import { getCanonicalHost } from '../../lib/url.js';
import { selectCoursesWithEditAccess } from '../../models/course.js';

import {
  InstructorQuestionSettings,
  SelectedAssessmentsSchema,
  SharingSetRowSchema,
} from './instructorQuestionSettings.html.js';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    // We use a separate `test/` POST route so that we can always use the
    // route to distinguish between pages that need to execute course code
    // (this `test/` handler) and pages that need access to course content
    // editing (here the plain '/' POST handler).
    if (req.body.__action === 'test_once') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw new error.HttpStatusError(403, 'Access denied (must be a course Viewer)');
      }
      const count = 1;
      const showDetails = true;
      const jobSequenceId = await startTestQuestion(
        count,
        showDetails,
        res.locals.question,
        res.locals.course_instance,
        res.locals.course,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
    } else if (req.body.__action === 'test_100') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw new error.HttpStatusError(403, 'Access denied (must be a course Viewer)');
      }
      if (res.locals.question.grading_method !== 'External') {
        const count = 100;
        const showDetails = false;
        const jobSequenceId = await startTestQuestion(
          count,
          showDetails,
          res.locals.question,
          res.locals.course_instance,
          res.locals.course,
          res.locals.authn_user.user_id,
        );
        res.redirect(res.locals.urlPrefix + '/jobSequence/' + jobSequenceId);
      } else {
        throw new Error('Not supported for externally-graded questions');
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    if (req.body.__action === 'change_id') {
      if (!req.body.id) {
        throw new error.HttpStatusError(400, `Invalid QID (was falsy): ${req.body.id}`);
      }
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
        throw new error.HttpStatusError(
          400,
          `Invalid QID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        );
      }
      let qid_new;
      try {
        qid_new = path.normalize(req.body.id);
      } catch {
        throw new error.HttpStatusError(
          400,
          `Invalid QID (could not be normalized): ${req.body.id}`,
        );
      }
      if (res.locals.question.qid === qid_new) {
        res.redirect(req.originalUrl);
      } else {
        const editor = new QuestionRenameEditor({
          locals: res.locals,
          qid_new,
        });
        const serverJob = await editor.prepareServerJob();
        try {
          await editor.executeWithServerJob(serverJob);
          res.redirect(req.originalUrl);
        } catch {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }
      }
    } else if (req.body.__action === 'copy_question') {
      if (idsEqual(req.body.to_course_id, res.locals.course.id)) {
        // In this case, we are making a duplicate of this question in the same course
        const editor = new QuestionCopyEditor({
          locals: res.locals,
        });
        const serverJob = await editor.prepareServerJob();
        try {
          await editor.executeWithServerJob(serverJob);
        } catch {
          return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        }
        const questionId = await sqldb.queryRow(
          sql.select_question_id_from_uuid,
          { uuid: editor.uuid, course_id: res.locals.course.id },
          IdSchema,
        );
        flash(
          'success',
          'Question copied successfully. You are now viewing your copy of the question.',
        );
        res.redirect(res.locals.urlPrefix + '/question/' + questionId + '/settings');
      } else {
        await copyQuestionBetweenCourses(res, {
          fromCourse: res.locals.course,
          toCourseId: req.body.to_course_id,
          question: res.locals.question,
        });
      }
    } else if (req.body.__action === 'delete_question') {
      const editor = new QuestionDeleteEditor({
        locals: res.locals,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        res.redirect(res.locals.urlPrefix + '/course_admin/questions');
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw new error.HttpStatusError(403, 'Access denied');
    }
    // Construct the path of the question test route. We'll do this based on
    // `originalUrl` so that this router doesn't have to be aware of where it's
    // mounted.
    const host = getCanonicalHost(req);
    let questionTestPath = new URL(`${host}${req.originalUrl}`).pathname;
    if (!questionTestPath.endsWith('/')) {
      questionTestPath += '/';
    }
    questionTestPath += 'test';

    // Generate a CSRF token for the test route. We can't use `res.locals.__csrf_token`
    // here because this form will actually post to a different route, not `req.originalUrl`.
    const questionTestCsrfToken = generateSignedToken(
      { url: questionTestPath, authn_user_id: res.locals.authn_user.user_id },
      config.secretKey,
    );

    let questionGHLink: string | null = null;
    if (res.locals.course.example_course) {
      // The example course is not found at the root of its repository, so its path is hardcoded
      questionGHLink = `https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/${res.locals.question.qid}`;
    } else if (res.locals.course.repository) {
      const githubPrefix = httpPrefixForCourseRepo(res.locals.course.repository);
      if (githubPrefix) {
        questionGHLink = `${githubPrefix}/tree/${res.locals.course.branch}/questions/${res.locals.question.qid}`;
      }
    }

    const qids = await sqldb.queryRows(sql.qids, { course_id: res.locals.course.id }, z.string());

    const assessmentsWithQuestion = await sqldb.queryRows(
      sql.select_assessments_with_question_for_display,
      { question_id: res.locals.question.id },
      SelectedAssessmentsSchema,
    );
    const sharingEnabled = await features.enabledFromLocals('question-sharing', res.locals);

    let sharingSetsIn;
    if (sharingEnabled) {
      const result = await sqldb.queryRows(
        sql.select_sharing_sets,
        {
          question_id: res.locals.question.id,
          course_id: res.locals.course.id,
        },
        SharingSetRowSchema,
      );
      sharingSetsIn = result.filter((row) => row.in_set);
    }
    const editableCourses = await selectCoursesWithEditAccess({
      user_id: res.locals.user.user_id,
      is_administrator: res.locals.is_administrator,
    });
    const infoPath = encodePath(path.join('questions', res.locals.question.qid, 'info.json'));

    res.send(
      InstructorQuestionSettings({
        resLocals: res.locals,
        questionTestPath,
        questionTestCsrfToken,
        questionGHLink,
        qids,
        assessmentsWithQuestion,
        sharingEnabled,
        sharingSetsIn,
        editableCourses,
        infoPath,
      }),
    );
  }),
);

export default router;
