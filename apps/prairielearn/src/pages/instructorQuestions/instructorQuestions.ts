import path from 'path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import { InsufficientCoursePermissionsCardPage } from '../../components/InsufficientCoursePermissionsCard.js';
import { config } from '../../lib/config.js';
import { copyQuestionBetweenCourses } from '../../lib/copy-question.js';
import { getCourseFilesClient } from '../../lib/course-files-api.js';
import { getCourseOwners } from '../../lib/course.js';
import {
  CourseSchema,
  QuestionSchema,
  TopicSchema,
  type Course,
  type Question,
} from '../../lib/db-types.js';
import { QuestionTransferEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectQuestionById, selectQuestionByUuid } from '../../models/question.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import { QuestionsPage } from './instructorQuestions.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

async function getExampleCourse(): Promise<Course> {
  const example_course = await sqldb.queryRow(sql.select_example_course, {}, CourseSchema);
  return example_course;
}

async function getTemplateCourseQuestions(exampleCourse: Course): Promise<Question[]> {
  const templateTopic = await sqldb.queryRow(
    sql.select_template_topic_for_course_id,
    {
      course_id: exampleCourse.id,
    },
    TopicSchema,
  );
  const templateQuestions = await sqldb.queryRows(
    sql.select_questions_for_course,
    {
      course_id: exampleCourse.id,
      topic_id: templateTopic.id,
    },
    QuestionSchema,
  );

  return templateQuestions;
}

router.get(
  '/',
  asyncHandler(async function (req, res) {
    if (!res.locals.authz_data.has_course_permission_preview) {
      // Access denied, but instead of sending them to an error page, we'll show
      // them an explanatory message and prompt them to get view permissions.
      const courseOwners = await getCourseOwners(res.locals.course.id);
      res.status(403).send(
        InsufficientCoursePermissionsCardPage({
          resLocals: res.locals,
          courseOwners,
          pageTitle: 'Questions',
          requiredPermissions: 'Previewer',
        }),
      );
      return;
    }

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const questions = await selectQuestionsForCourse(
      res.locals.course.id,
      courseInstances.map((ci) => ci.id),
    );

    const exampleCourse = await getExampleCourse();
    const templateQuestions = await getTemplateCourseQuestions(exampleCourse);

    const courseDirExists = await fs.pathExists(res.locals.course.path);
    res.send(
      QuestionsPage({
        questions,
        templateQuestions,
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
      if (!req.body.qid) {
        throw new error.HttpStatusError(400, 'qid is required');
      }
      if (!req.body.title) {
        throw new error.HttpStatusError(400, 'title is required');
      }
      if (!req.body.start_from) {
        throw new error.HttpStatusError(400, 'start_from is required');
      }

      const api = getCourseFilesClient();

      if (req.body.start_from === 'Empty question') {
        const result = await api.createQuestion.mutate({
          course_id: res.locals.course.id,
          user_id: res.locals.user.user_id,
          authn_user_id: res.locals.authn_user.user_id,
          has_course_permission_edit: res.locals.authz_data.has_course_permission_edit,
          qid: req.body.qid,
          title: req.body.title,
        });

        if (result.status === 'error') {
          res.redirect(res.locals.urlPrefix + '/edit_error/' + result.job_sequence_id);
          return;
        }

        res.redirect(
          res.locals.urlPrefix +
            '/question/' +
            result.question_id +
            '/file_view/questions/' +
            result.question_qid +
            '/question.html',
        );
      } else if (req.body.start_from === 'Template') {
        if (!req.body.template_qid) {
          throw new error.HttpStatusError(400, 'template_qid is required');
        }

        const exampleCourse = await getExampleCourse();
        const templateQuestion = await selectQuestionById(
          req.body.template_qid
        )

        await copyQuestionBetweenCourses(res, {
          fromCourse: exampleCourse,
          toCourseId: res.locals.course.id,
          question: templateQuestion,
          toTitleCustom: req.body.title,
          toQidCustom: req.body.qid,
        });

        // const f = uuidv4();
        // const relDir = path.join(f.slice(0, 3), f.slice(3, 6));

        // const storage_filename = path.join(relDir, f.slice(6));

        // if (config.filesRoot == null) throw new Error('config.filesRoot is null');

        // const editor = new QuestionTransferEditor({
        //   locals: res.locals,
        //   from_qid: req.body.template_qid,
        //   from_course_short_name: exampleCourse.short_name,
        //   from_path: path.join(config.filesRoot, storage_filename),
        //   to_title_custom: req.body.title,
        //   to_qid_custom: req.body.qid,
        // });

        // const serverJob = await editor.prepareServerJob();
        // try {
        //   await editor.executeWithServerJob(serverJob);
        // } catch (e) {
        //   console.error(e);
        //   res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
        //   return;
        // }

        // const question = await selectQuestionByUuid({
        //   course_id: res.locals.course.id,
        //   uuid: editor.uuid,
        // });

        // res.redirect(`${res.locals.urlPrefix}/question/${question.id}/settings`);
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
