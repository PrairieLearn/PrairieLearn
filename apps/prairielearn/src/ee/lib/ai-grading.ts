import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOneRowAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import {
  InstanceQuestionSchema,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  VariantSchema,
  Question,
  Course,
  AssessmentQuestion,
} from '../../lib/db-types.js';
import * as manualGrading from '../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../lib/question-render.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { createServerJob } from '../../lib/server-jobs.js';
import * as questionServers from '../../question-servers/index.js';

import { createEmbedding, vectorToString } from './contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);

const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
const GPTGradeSchema = z.object({ grade: z.number(), feedback: z.string() });

async function embed({
  course,
  question,
  assessment_question,
  urlPrefix,
  openai,
}: {
  question: Question;
  course: Course;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  openai: OpenAI;
}): Promise<number> {
  if (!config.openAiApiKey || !config.openAiOrganization) {
    throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
  }

  const question_course = await getQuestionCourse(question, course);

  const result = await queryRows(
    sql.select_all_instance_questions,
    {
      assessment_id: assessment_question.assessment_id,
      assessment_question_id: assessment_question.id,
    },
    InstanceQuestionSchema,
  );

  for (const instance_question of result) {
    const { variant, submission } = await queryRow(
      sql.select_last_variant_and_submission,
      { instance_question_id: instance_question.id },
      SubmissionVariantSchema,
    );
    const submission_embedding = await queryOptionalRow(
      sql.select_embedding_for_submission,
      { submission_id: submission.id },
      SubmissionGradingContextEmbeddingSchema,
    );

    // Do no recalculate embedding if it already exists for a submission
    if (submission_embedding) {
      continue;
    }
    const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
    const questionModule = questionServers.getModule(question.type);
    const render_submission_results = await questionModule.render(
      { question: false, submissions: true, answer: false },
      variant,
      question,
      submission,
      [submission],
      question_course,
      urls,
    );
    const $ = cheerio.load(render_submission_results.data.submissionHtmls[0], null, false);
    $('script').remove();
    const student_answer = $.html();
    console.log('getting embedding for new submission');
    // const embedding = createEmbedding(openai, student_answer, `course_${course.id}`);
    const embedding = [1, 2, 3];
    await queryOneRowAsync(sql.update_embedding_for_submission, {
      embedding,
      submission_id: submission.id,
      submission_text: student_answer,
    });
  }

  return 0;
}

export async function aiGrade({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
}): Promise<string> {
  // if OpenAI API Key and Organization are not provided, throw error
  if (!config.openAiApiKey || !config.openAiOrganization) {
    throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
  }
  const openai = new OpenAI({
    apiKey: config.openAiApiKey,
    organization: config.openAiOrganization,
  });

  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    courseId: course.id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_question.assessment_id,
    authnUserId: authn_user_id,
    userId: user_id,
    type: 'ai_grading',
    description: 'Use LLM to grade assessment question',
  });

  serverJob.executeInBackground(async (job) => {
    await embed({
      course,
      question,
      assessment_question,
      urlPrefix,
      openai,
    });

    const result = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_id: assessment_question.assessment_id,
        assessment_question_id: assessment_question.id,
      },
      InstanceQuestionSchema,
    );

    job.info(`Found ${result.length} submissions to grade!`);

    let error_count = 0;
    let output_count = 0;
    let output: string | null = null;

    // Grade each instance question.
    for (const instance_question of result) {
      const { variant, submission } = await queryRow(
        sql.select_last_variant_and_submission,
        { instance_question_id: instance_question.id },
        SubmissionVariantSchema,
      );

      const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);

      // get question html
      const questionModule = questionServers.getModule(question.type);
      const render_question_results = await questionModule.render(
        { question: true, submissions: false, answer: false },
        variant,
        question,
        null,
        [],
        question_course,
        urls,
      );
      if (render_question_results.courseIssues.length) {
        job.info(render_question_results.courseIssues.toString());
        job.error('Error occurred');
        job.fail('Errors occurred while AI grading, see output for details');
      }
      let $ = cheerio.load(render_question_results.data.questionHtml, null, false);
      $('script').remove();
      const question_prompt = $.html();

      const render_submission_results = await questionModule.render(
        { question: false, submissions: true, answer: false },
        variant,
        question,
        submission,
        [submission],
        question_course,
        urls,
      );
      $ = cheerio.load(render_submission_results.data.submissionHtmls[0], null, false);
      $('script').remove();
      const student_answer = $.html();

      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content:
              'You are an instructor for a course, and you are grading assignments. You should always return the grade using a json object of 2 parameters: grade and feedback. The grade should be an integer between 0 and 100. 0 being the lowest and 100 being the highest, and the feedback should be why you give this grade, or how to improve the answer. You can say correct or leave blank when the grade is close to 100. ',
          },
          {
            role: 'user',
            content: `Question: \n${question_prompt} \nAnswer: \n${student_answer} \nHow would you grade this? Please return the json object.`,
          },
        ],
        model: 'gpt-3.5-turbo',
        user: `course_${course.id}`,
      });

      let msg = `\nInstance question ${instance_question.id}\n`;
      try {
        msg += `Number of tokens used: ${completion.usage ? completion.usage.total_tokens : 0}\n`;
        msg += `Raw ChatGPT response:\n${completion.choices[0].message.content}`;
        if (completion.choices[0].message.content === null) {
          error_count++;
          continue;
        }
        const gpt_answer = GPTGradeSchema.parse(JSON.parse(completion.choices[0].message.content));
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
        msg += `\nAI grades: ${gpt_answer.grade}`;
      } catch (err) {
        job.error(`ERROR AI grading for ${instance_question.id}`);
        job.error(err);
        error_count++;
      }
      output = (output == null ? '' : `${output}\n`) + msg;
      output_count++;
      if (output_count >= 5) {
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
      job.fail('Errors occurred while AI grading, see output for details');
    }
  });

  return serverJob.jobSequenceId;
}
