import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { QuestionAddEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { QuestionsPageDataAnsified, selectQuestionsForCourse } from '../../models/questions.js';

import { QuestionsPage } from './instructorQuestions.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const questions: QuestionsPageDataAnsified[] = await selectQuestionsForCourse(
      res.locals.course.id,
      courseInstances.map((ci) => ci.id),
    );

    const courseDirExists = await fs.pathExists(res.locals.course.path);
    res.send(
      QuestionsPage({
        questions,
        course_instances: courseInstances,
        showAddQuestionButton:
          res.locals.authz_data.has_course_permission_edit &&
          !res.locals.course.example_course &&
          courseDirExists,
        showAiGenerateQuestionButton:
          res.locals.authz_data.has_course_permission_edit &&
          !res.locals.course.example_course &&
          (await features.enabledFromLocals('ai-question-generation', res.locals)),
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_question') {
      const editor = new QuestionAddEditor({
        locals: res.locals,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        return;
      }

      const result = await sqldb.queryOneRowAsync(sql.select_question_id_from_uuid, {
        uuid: editor.uuid,
        course_id: res.locals.course.id,
      });
      res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings');
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
