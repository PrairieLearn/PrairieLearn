import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { OpenAI } from 'openai';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { InstanceQuestionSchema, SubmissionSchema, VariantSchema } from '../../../lib/db-types.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { buildLocals, buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import { createServerJob } from '../../../lib/server-jobs.js';
import * as questionServers from '../../../question-servers/index.js';

const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  modified_at: z.string(),
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  max_points: z.number().nullable(),
  max_auto_points: z.number().nullable(),
  max_manual_points: z.number().nullable(),
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
});

// /**
//  * Renders the HTML for a variant.
//  * @protected
//  *
//  * @param variant_course - The course for the variant.
//  * @param renderSelection - Specify which panels should be rendered.
//  * @param variant - The variant to submit to.
//  * @param question - The question for the variant.
//  * @param submission - The current submission to the variant.
//  * @param submissions - The full list of submissions to the variant.
//  * @param question_course - The course for the question.
//  * @param locals - The current locals for the page response.
//  * @type {(variant_course: import('./db-types.js').Course, ...a: Parameters<import('../question-servers/index.js').QuestionServer['render']>) => Promise<import('../question-servers/index.js').RenderResultData>}
//  */
// async function render(
//   variant_course,
//   renderSelection,
//   variant,
//   question,
//   submission,
//   submissions,
//   question_course,
//   locals,
// ) {
//   const questionModule = questionServers.getModule(question.type);

//   const { courseIssues, data } = await questionModule.render(
//     renderSelection,
//     variant,
//     question,
//     submission,
//     submissions,
//     question_course,
//     locals,
//   );

//   const studentMessage = 'Error rendering question';
//   const courseData = { variant, question, submission, course: variant_course };
//   // locals.authn_user may not be populated when rendering a panel
//   const user_id = locals && locals.authn_user ? locals.authn_user.user_id : null;
//   // await writeCourseIssues(courseIssues, variant, user_id, studentMessage, courseData);
//   return data;
// }

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    res.render(import.meta.filename.replace(/\.(js|ts)$/, '.ejs'), res.locals);
  }),
);

router.get(
  '/instances.json',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }

    const result = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question.id,
      },
      InstanceQuestionRowSchema,
    );
    res.send({ instance_questions: result.map((row, idx) => ({ index: idx + 1, ...row })) });
  }),
);

router.get(
  '/next_ungraded',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    if (
      req.query.prior_instance_question_id != null &&
      typeof req.query.prior_instance_question_id !== 'string'
    ) {
      throw new error.HttpStatusError(400, 'prior_instance_question_id must be a single value');
    }
    res.redirect(
      await manualGrading.nextUngradedInstanceQuestionUrl(
        res.locals.urlPrefix,
        res.locals.assessment.id,
        res.locals.assessment_question.id,
        res.locals.authz_data.user.user_id,
        req.query.prior_instance_question_id ?? null,
      ),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    if (req.body.__action === 'batch_action') {
      const action_data = JSON.parse(req.body.batch_action_data) || {};
      const instance_question_ids = Array.isArray(req.body.instance_question_id)
        ? req.body.instance_question_id
        : [req.body.instance_question_id];
      await queryAsync(sql.update_instance_questions, {
        course_instance_id: res.locals.course_instance.id,
        assessment_question_id: res.locals.assessment_question.id,
        instance_question_ids,
        update_requires_manual_grading: 'requires_manual_grading' in action_data,
        requires_manual_grading: !!action_data?.requires_manual_grading,
        update_assigned_grader: 'assigned_grader' in action_data,
        assigned_grader: action_data?.assigned_grader,
      });
      res.send({});
    } else if (req.body.__action === 'edit_question_points') {
      const result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment.id,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at,
        {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
        },
        res.locals.authn_user.user_id,
      );
      if (result.modified_at_conflict) {
        res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      } else {
        res.send({});
      }
    } else if (req.body.__action === 'edit_question_score_perc') {
      const result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment.id,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at,
        { score_perc: req.body.score_perc },
        res.locals.authn_user.user_id,
      );
      if (result.modified_at_conflict) {
        res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      } else {
        res.send({});
      }
    } else if (req.body.__action === 'bot_grade_assessment') {
      // TODO check if bot grading is enabled
      // if (!res.locals.question_sharing_enabled) {
      //   throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      // }

      console.log('BOT GRADING THE ASSESSMENT!');
      // res.send({});
      console.log(config.openAiApiKey);
      const { urlPrefix, assessment, assessment_instance, assessment_question, authz_result } =
        res.locals;

      const question = res.locals.question;
      const question_course = await getQuestionCourse(question, res.locals.course);

      // Do something like the following (look at instructorLoadFromDisk.js to see how it works)
      const serverJob = await createServerJob({
        courseId: res.locals.course ? res.locals.course.id : null,
        type: 'botGrading',
        description: 'Use LLM to grade assessment question',
      });

      serverJob.executeInBackground(async (job) => {
        console.log('running grading in background');

        const openai = new OpenAI({ apiKey: '', organization: '' }); // TODO: replace with config
        console.log('OpenAI API ready');

        // get all instance questions
        const result = await queryRows(
          sql.select_instance_questions_manual_grading,
          {
            assessment_id: res.locals.assessment.id,
            assessment_question_id: res.locals.assessment_question.id,
          },
          InstanceQuestionSchema,
        );

        // get each instance question
        for (const instance_question of result) {
          // get last submission of instance question
          const submission = await queryRow(
            sql.select_last_submission,
            { instance_question_id: instance_question.id },
            SubmissionSchema,
          );

          // maybe remove some if statements that can never happen
          // if nothing submitted
          if (submission.submitted_answer == null) {
            continue;
          }
          // if no file submitted or too many files submitted
          if (
            submission.submitted_answer._files == null ||
            submission.submitted_answer._files.length !== 1
          ) {
            continue;
          }
          const student_answer = atob(submission.submitted_answer._files[0].contents);
          console.log(student_answer);

          // get question prompt
          const variant = await queryRow(
            sql.select_last_variant,
            { instance_question_id: instance_question.id },
            VariantSchema,
          );

          // build new locals for the question server
          const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
          const newLocals = buildLocals(
            variant,
            question,
            instance_question,
            assessment,
            assessment_instance,
            assessment_question,
            authz_result,
          );
          const locals = {};
          Object.assign(locals, urls);
          Object.assign(locals, newLocals);

          const questionModule = questionServers.getModule(question.type);
          const { courseIssues, data } = await questionModule.render(
            { question: true, submissions: false, answer: false },
            variant,
            question,
            submission,
            [submission],
            question_course,
            locals,
          );
          // console.log(data);

          // TODO: Call OpenAI API to grade
          const question_prompt = data.questionHtml.split('<script>', 2)[0];
          console.log(question_prompt);
          // const openai_messages = [
          //   {
          //     role: 'system',
          //     content: `You are an instructor for a course, and you are grading assignments. You should always return the grade using a json object of 2 parameters: grade and feedback. The grade should be an integer between 0 and 100. 0 being the lowest and 100 being the highest, and the feedback should be why you give this grade, or how to improve the answer. You can say correct or leave blank when the grade is close to 100. `,
          //   },
          //   {
          //     role: 'user',
          //     content: `Question: \n${question_prompt} \nAnswer: \n${student_answer} \nHow would you grade this? Please return the json object.`,
          //   },
          // ];

          // const completion = await openai.chat.completions.create({
          //   messages: [
          //     {
          //       role: 'system',
          //       content: `You are an instructor for a course, and you are grading assignments. You should always return the grade using a json object of 2 parameters: grade and feedback. The grade should be an integer between 0 and 100. 0 being the lowest and 100 being the highest, and the feedback should be why you give this grade, or how to improve the answer. You can say correct or leave blank when the grade is close to 100. `,
          //     },
          //     {
          //       role: 'user',
          //       content: `Question: \n${question_prompt} \nAnswer: \n${student_answer} \nHow would you grade this? Please return the json object.`,
          //     },
          //   ],
          //   model: 'gpt-3.5-turbo',
          // });

          // console.log(completion.choices[0]);

          const update_result = await manualGrading.updateInstanceQuestionScore(
            res.locals.assessment.id,
            instance_question.id,
            submission.id,
            req.body.modified_at,
            {
              score_perc: 50, // replace with LLM score
              feedback: { manual: 'replace with grader feedback' }, // replace with LLM feedback
              // TODO: rubrics
            },
            '1',
          );
          // if (update_result.modified_at_conflict) {
          //   res.send({
          //     conflict_grading_job_id: update_result.grading_job_id,
          //     conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${update_result.grading_job_id}`,
          //   });
          // } else {
          //   res.send({});
          // }
        }

        // call the API to grade the thing
        // Put the grade in the database (make a new grading_job, assign to user id 1)
        // Can we just call the function "updateInstanceQuestionScore" from manualGrading.ts?

        job.info('running'); // Do we really need to use the ServerJob interface?
      });

      // for debugging, run your docker container with "docker run -it --rm -p 3000:3000 -e NODEMON=true -v ~/git/PrairieLearn:/PrairieLearn --name mypl prairielearn/prairielearn"
      // to check out your database, run "docker exec -it mypl psql postgres"

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
