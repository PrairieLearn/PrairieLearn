import type OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import z from 'zod';

import { loadSqlEquiv, queryAsync, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AiClusterSchema, type Course, type InstanceQuestion, type Question } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import * as questionServers from '../../../question-servers/index.js';
import { generateSubmissionMessage, selectLastVariantAndSubmission } from '../ai-grading/ai-grading-util.js';

const sql = loadSqlEquiv(import.meta.url);

const CLUSTERING_OPENAI_MODEL: OpenAI.Chat.ChatModel = 'gpt-5';

const STANDARD_CLUSTERS = [
    {
      name: 'Likely Match', 
      description: 'The final answer likely matches the correct answer.'
    }, {
      name: 'Review Needed',
      description: 'The AI model could not confidently determine that the final answer is correct.'
    }
]

/** Insert the clusters for an assessment question if they don't exist */
export async function insertAiClusters({
    assessment_question_id
}: {
    assessment_question_id: string
}) {
    const aiClustersExist = await getAiClustersExist({ assessmentQuestionId: assessment_question_id });
    if (aiClustersExist) {
        return;
    }

    await runInTransactionAsync(async () => {
        for (const cluster_name of STANDARD_CLUSTERS) {
            await queryAsync(sql.create_ai_cluster, {
                assessment_question_id,
                cluster_name 
            });
        }
    });
}

export async function selectAiCluster(ai_cluster_id: string) {
  return await queryRow(
    sql.select_ai_cluster,
    {
      ai_cluster_id
    },
    AiClusterSchema
  );
}

export async function updateAiCluster({
    instance_question_id, 
    ai_cluster_id
}: {
    instance_question_id: string,
    ai_cluster_id: string 
}) {
    await queryAsync(sql.update_instance_question_ai_cluster, {
      instance_question_id,
      ai_cluster_id
    })
}

/** whether or not the AI clusters exist for a given assessment question. */
export async function getAiClustersExist({
    assessmentQuestionId
}: {
    assessmentQuestionId: string
}) {
    return await queryRow(sql.select_exists_ai_clusters, {
        assessment_question_id: assessmentQuestionId
    }, z.boolean());
}

export async function selectAiClusters({
    assessmentQuestionId
}: {
    assessmentQuestionId: string
}) {
    return await queryRows(sql.select_ai_clusters, {
        assessment_question_id: assessmentQuestionId
    }, AiClusterSchema);
}

export async function getInstanceQuestionAnswer({
  question,
  instance_question,
  course,
  urlPrefix
} : {
  question: Question;
  instance_question: InstanceQuestion;
  course: Course;
  urlPrefix: string;
}) {
  const {submission, variant} = await selectLastVariantAndSubmission(instance_question.id);
  const locals = {
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    questionRenderContext: 'ai_grading',
  };
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: false, answer: true },
    variant,
    question,
    submission,
    [submission],
    course,
    locals,
  );

  return render_submission_results.data.answerHtml;
}

/**
 * Given a question, the AI returns whether or not the student-provided final answer is correct. 
 * Specifically for handwritten submissions captured with pl-image-capture.
 */
export async function aiEvaluateStudentResponse({
  question,
  question_answer,
  instance_question,
  course,
  urlPrefix,
  openai
}: {
  question: Question;
  question_answer: string;
  instance_question: InstanceQuestion;
  course: Course;
  urlPrefix: string;
  openai: OpenAI;
}) {
  const {submission, variant} = await selectLastVariantAndSubmission(instance_question.id);
  const locals = {
    ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
    questionRenderContext: 'ai_grading',
  };
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: true, answer: false },
    variant,
    question,
    submission,
    [submission],
    course,
    locals,
  );


  const submission_text = render_submission_results.data.submissionHtmls[0];

  const submissionMessage = generateSubmissionMessage({
    submission_text,
    submitted_answer: submission.submitted_answer,
    include_images_only: true
  });

  // Extract all images
  const promptImageUrls: string[] = [];
  if (submissionMessage && submissionMessage.content) {
    for (const part of 
      submissionMessage.content) {
      if (typeof part === 'object' && part.type === 'image_url') {
        promptImageUrls.push(part.image_url.url);
      }
    }
  }

  // Prompt the LLM to determine if the submission is correct or not.
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: 'Start of student submission:',
    },
    submissionMessage,
    {
      role: 'user',
      content: 'End of student submission.',
    },
    {
      role: 'user',
      content: `CORRECT ANSWER = \n${question_answer}`,
    },
    {
      role: 'user',
      content: `
Identify the student's final answer. Then, identify the student's box answer. Consider the box answer. If the boxed answer exists, response = boxed answer. Else, response = final answer.

Does the student's response match the correct answer exactly? Must be PRECISELY mathematically equivalent to the answer as written.

Ensure that all parts of the correct answer are included. Any error in the response will disqualify it from being a correct answer.

If it seems AMBIGUOUS (e.g. a few answers are present, one answer erased out, crossed out), mark it incorrect.

Return a boolean corresponding to whether or not the student's response is equivalent to the correct answer.
      `
    }
  ];

  const completion = await openai.chat.completions.parse({
    messages,
    model: CLUSTERING_OPENAI_MODEL,
    user: `course_${course.id}`,
    response_format: zodResponseFormat(
      z.object({
        correct: z.boolean(),
      }),
      'response-evaluation',
    )
  });

  const completionContent = completion.choices[0].message.parsed;

  if (!completionContent) {
    throw new Error('No completion content returned from OpenAI.');
  }

  return completionContent.correct;
}

export async function resetInstanceQuestionsAiClusters(
  {
    assessment_question_id
  }: {
    assessment_question_id: string
  }
) {
  return await queryRow(sql.reset_instance_questions_ai_clusters, {
    assessment_question_id
  }, z.number());
}