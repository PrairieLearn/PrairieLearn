import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { OpenAI } from 'openai';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { loadSqlEquiv, queryAsync, queryRow, queryRows } from '@prairielearn/postgres';

import { config } from '../../../lib/config.js';
import { InstanceQuestionSchema, SubmissionSchema, VariantSchema } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
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

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    res.locals.bot_grading_enabled = await features.enabledFromLocals('bot-grading', res.locals);
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
      // check if bot grading is enabled
      const bot_grading_enabled = await features.enabledFromLocals('bot-grading', res.locals);
      if (!bot_grading_enabled) {
        throw new error.HttpStatusError(403, 'Access denied (feature not available)');
      }
      console.log('Bot grading the assessment question');

      if (config.openAiApiKey === null || config.openAiOrganization === null) {
        throw new error.HttpStatusError(501, 'Not implemented (feature not available)');
      }

      // everything after this goes into the function

      const openaiconfig = {
        apiKey: config.openAiApiKey,
        organization: config.openAiOrganization,
      };

      const { urlPrefix, assessment, assessment_instance, assessment_question, authz_result } =
        res.locals;
      const question = res.locals.question;
      const question_course = await getQuestionCourse(question, res.locals.course);

      const serverJob = await createServerJob({
        courseId: res.locals.course ? res.locals.course.id : null,
        type: 'botGrading',
        description: 'Use LLM to grade assessment question',
      });

      serverJob.executeInBackground(async (job) => {
        const openai = new OpenAI(openaiconfig);

        // get all instance questions
        const result = await queryRows(
          sql.select_instance_questions_manual_grading,
          {
            assessment_id: res.locals.assessment.id,
            assessment_question_id: res.locals.assessment_question.id,
          },
          InstanceQuestionSchema,
        );

        let error_count = 0;
        let output_count = 0;
        let output: string | null = null;

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

          // get question html
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
          if (courseIssues.length) {
            job.info(courseIssues.toString());
            job.error('Error occurred');
            job.fail('Errors occurred while bot grading, see output for details');
          }

          const question_prompt = data.questionHtml.split('<script>', 2)[0];

          // Call OpenAI API
          const completion = await openai.chat.completions.create({
            messages: [
              {
                role: 'system',
                content: `You are an instructor for a course, and you are grading assignments. You should always return the grade using a json object of 2 parameters: grade and feedback. The grade should be an integer between 0 and 100. 0 being the lowest and 100 being the highest, and the feedback should be why you give this grade, or how to improve the answer. You can say correct or leave blank when the grade is close to 100. `,
              },
              {
                role: 'user',
                content: `Question: \n${question_prompt} \nAnswer: \n${student_answer} \nHow would you grade this? Please return the json object.`,
              },
            ],
            model: 'gpt-3.5-turbo',
          });

          let msg = '';
          try {
            if (completion.choices[0].message.content === null) {
              error_count++;
              continue;
            }
            const gpt_answer = JSON.parse(completion.choices[0].message.content);
            const update_result = await manualGrading.updateInstanceQuestionScore(
              res.locals.assessment.id,
              instance_question.id,
              submission.id,
              req.body.modified_at,
              {
                score_perc: gpt_answer.grade,
                feedback: { manual: gpt_answer.feedback },
                // NEXT STEPS: rubrics
              },
              '1',
            );
            msg = `Bot grades for ${instance_question.id}: ${gpt_answer.grade}`;
            if (update_result.modified_at_conflict) {
              error_count++;
              msg += `\nERROR modified at conflict for ${instance_question.id}`;
            }
          } catch (err) {
            logger.error('error while regrading', { err });
            error_count++;
            msg = `ERROR bot grading for ${instance_question.id}`;
          }
          output = (output == null ? '' : `${output}\n`) + msg;
          output_count++;
          if (output_count >= 100) {
            job.info(output);
            output = null;
            output_count = 0;
          }
        }

        if (output != null) {
          job.info(output);
        }
        if (error_count > 0) {
          job.error('Number of errors: ' + error_count);
          job.fail('Errors occurred while bot grading, see output for details');
        }
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
