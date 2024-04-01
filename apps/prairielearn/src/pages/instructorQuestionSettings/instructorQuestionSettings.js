// @ts-check
const asyncHandler = require('express-async-handler');
import * as express from 'express';
import * as error from '@prairielearn/error';
import { startTestQuestion } from '../../lib/question-testing';
import * as sqldb from '@prairielearn/postgres';
import * as path from 'path';
import { z } from 'zod';

import { QuestionRenameEditor, QuestionDeleteEditor, QuestionCopyEditor } from '../../lib/editors';
import { config } from '../../lib/config';
import { encodePath } from '../../lib/uri-util';
import { idsEqual } from '../../lib/id';
import { generateSignedToken } from '@prairielearn/signed-token';
import { copyQuestionBetweenCourses } from '../../lib/copy-question';
import { flash } from '@prairielearn/flash';
import { features } from '../../lib/features/index';
import { getCanonicalHost } from '../../lib/url';
import { isEnterprise } from '../../lib/license';
import { selectCoursesWithEditAccess } from '../../models/course';
import { IdSchema } from '../../lib/db-types';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

const SelectedAssessmentsSchema = z.object({
  title: z.string(),
  course_instance_id: IdSchema,
  assessments: z.array(
    z.object({
      assessment_id: IdSchema,
      color: z.string(),
      label: z.string(),
    }),
  ),
});

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw error.make(403, 'Access denied');
    }
    // We use a separate `test/` POST route so that we can always use the
    // route to distinguish between pages that need to execute course code
    // (this `test/` handler) and pages that need access to course content
    // editing (here the plain '/' POST handler).
    if (req.body.__action === 'test_once') {
      if (!res.locals.authz_data.has_course_permission_view) {
        throw error.make(403, 'Access denied (must be a course Viewer)');
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
        throw error.make(403, 'Access denied (must be a course Viewer)');
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
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw error.make(403, 'Access denied');
    }
    if (req.body.__action === 'change_id') {
      if (!req.body.id) throw error.make(400, `Invalid QID (was falsy): ${req.body.id}`);
      if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) {
        throw error.make(
          400,
          `Invalid QID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`,
        );
      }
      let qid_new;
      try {
        qid_new = path.normalize(req.body.id);
      } catch (err) {
        throw error.make(400, `Invalid QID (could not be normalized): ${req.body.id}`);
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
        } catch (err) {
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
        } catch (err) {
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
      } catch (err) {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else if (req.body.__action === 'sharing_set_add') {
      const questionSharingEnabled = await features.enabledFromLocals(
        'question-sharing',
        res.locals,
      );
      if (!questionSharingEnabled) {
        throw error.make(403, 'Access denied (feature not available)');
      }
      if (!res.locals.authz_data.has_course_permission_own) {
        throw error.make(403, 'Access denied (must be a course Owner)');
      }
      await sqldb.queryAsync(sql.sharing_set_add, {
        course_id: res.locals.course.id,
        question_id: res.locals.question.id,
        unsafe_sharing_set_id: req.body.unsafe_sharing_set_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'share_publicly') {
      const questionSharingEnabled = await features.enabledFromLocals(
        'question-sharing',
        res.locals,
      );
      if (!questionSharingEnabled) {
        throw error.make(403, 'Access denied (feature not available)');
      }
      if (!res.locals.authz_data.has_course_permission_own) {
        throw error.make(403, 'Access denied (must be a course Owner)');
      }
      await sqldb.queryAsync(sql.update_question_shared_publicly, {
        course_id: res.locals.course.id,
        question_id: res.locals.question.id,
      });
      res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (res.locals.question.course_id !== res.locals.course.id) {
      throw error.make(403, 'Access denied');
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

    res.locals.questionTestPath = questionTestPath;
    res.locals.questionTestCsrfToken = questionTestCsrfToken;

    res.locals.isEnterprise = isEnterprise();

    res.locals.questionGHLink = null;
    if (res.locals.course.repository) {
      const githubRepoMatch = res.locals.course.repository.match(
        /^git@github.com:\/?(.+?)(\.git)?\/?$/,
      );
      if (githubRepoMatch) {
        res.locals.questionGHLink =
          'https://github.com/' +
          githubRepoMatch[1] +
          `/tree/${res.locals.course.branch}/questions/` +
          res.locals.question.qid;
      }
    } else if (res.locals.course.example_course) {
      res.locals.questionGHLink = `https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/${res.locals.question.qid}`;
    }

    res.locals.qids = await sqldb.queryRows(
      sql.qids,
      { course_id: res.locals.course.id },
      z.string().nullable(),
    );

    res.locals.a_with_q_for_all_ci = await sqldb.queryRows(
      sql.select_assessments_with_question_for_display,
      { question_id: res.locals.question.id },
      SelectedAssessmentsSchema,
    );
    res.locals.sharing_enabled = await features.enabledFromLocals('question-sharing', res.locals);

    if (res.locals.sharing_enabled) {
      let result = await sqldb.queryAsync(sql.select_sharing_sets, {
        question_id: res.locals.question.id,
        course_id: res.locals.course.id,
      });
      res.locals.sharing_sets_in = result.rows.filter((row) => row.in_set);
      res.locals.sharing_sets_other = result.rows.filter((row) => !row.in_set);
    }

    res.locals.editable_courses = await selectCoursesWithEditAccess({
      user_id: res.locals.user.user_id,
      is_administrator: res.locals.is_administrator,
    });
    res.locals.infoPath = encodePath(path.join('questions', res.locals.question.qid, 'info.json'));

    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  }),
);

export default router;
