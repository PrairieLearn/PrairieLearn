import { OpenAI, type ClientOptions } from 'openai';
import { z } from 'zod';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  InstanceQuestionSchema,
  SubmissionSchema,
  VariantSchema,
  Question,
  Course,
  AssessmentQuestion,
} from '../lib/db-types.js';
import * as manualGrading from '../lib/manualGrading.js';
import { buildQuestionUrls } from '../lib/question-render.js';
import { getQuestionCourse } from '../lib/question-variant.js';
import { createServerJob } from '../lib/server-jobs.js';
import * as questionServers from '../question-servers/index.js';

const sql = loadSqlEquiv(import.meta.url);

const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});

export async function botGrade({
  course,
  course_instance_id,
  openaiconfig,
  question,
  assessment_question,
  urlPrefix,
}: {
  openaiconfig: ClientOptions;
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
}): Promise<string> {
  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    courseId: course.id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_question.assessment_id,
    authnUserId: '1',
    type: 'botGrading',
    description: 'Use LLM to grade assessment question',
  });

  serverJob.executeInBackground(async (job) => {
    const openai = new OpenAI(openaiconfig);
    job.info('OpenAI client ready! ');

    // get all instance questions
    const result = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: assessment_question.assessment_id,
        assessment_question_id: assessment_question.id,
      },
      InstanceQuestionSchema,
    );

    job.info(`Found ${result.length} submissions to grade! `);

    let error_count = 0;
    let output_count = 0;
    let output: string | null = null;

    // get each instance question
    for (const instance_question of result) {
      const { variant, submission } = await queryRow(
        sql.select_last_variant_and_submission,
        { instance_question_id: instance_question.id },
        SubmissionVariantSchema,
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
      const student_answer = Buffer.from(
        submission.submitted_answer._files[0].contents,
        'base64',
      ).toString();

      // build urls for the question server
      const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);

      // get question html
      const questionModule = questionServers.getModule(question.type);
      const { courseIssues, data } = await questionModule.render(
        { question: true, submissions: false, answer: false },
        variant,
        question,
        submission,
        [submission],
        question_course,
        urls,
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
        await manualGrading.updateInstanceQuestionScore(
          assessment_question.assessment_id,
          instance_question.id,
          submission.id,
          null, // modified_at
          {
            score_perc: gpt_answer.grade,
            feedback: { manual: gpt_answer.feedback },
            // NEXT STEPS: rubrics
          },
          '1',
        );
        msg = `Bot grades for ${instance_question.id}: ${gpt_answer.grade}`;
      } catch (err) {
        job.error(`ERROR bot grading for ${instance_question.id}`);
        job.error(err);
        error_count++;
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

  return serverJob.jobSequenceId;
}
