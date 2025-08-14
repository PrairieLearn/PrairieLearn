


import type OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import z from 'zod';

import { loadSqlEquiv, queryAsync, queryOptionalRow, queryRow, queryRows, runInTransactionAsync } from '@prairielearn/postgres';

import { AiClusterSchema, type Course, type InstanceQuestion, type Question } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import * as questionServers from '../../../question-servers/index.js';
import { generateSubmissionMessage, selectLastVariantAndSubmission } from '../ai-grading/ai-grading-util.js';

const sql = loadSqlEquiv(import.meta.url);

const CLUSTERING_OPENAI_MODEL: OpenAI.Chat.ChatModel = 'gpt-5';

const STANDARD_CLUSTERS = [
    'Correct', 'Incorrect'
]

/** Insert the clusters for an assessment question if they don't exist */
export async function insertAiClusters({
    assessment_question_id
}: {
    assessment_question_id: string
}) {
    const aiClustersExist = await queryRow(sql.select_exists_ai_clusters, {
        assessment_question_id
    }, z.boolean());
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

export async function assignAiCluster({
    instanceQuestionId, 
    aiClusterId
}: {
    instanceQuestionId: string,
    aiClusterId: string 
}) {
    await queryAsync(sql.upsert_ai_cluster_for_instance_question, {
        instance_question_id: instanceQuestionId,
        ai_cluster_id: aiClusterId
    })
}

export async function getAiClusterAssignmentForInstanceQuestion({
    instanceQuestionId
}: {
    instanceQuestionId: string
}) {
    return await queryOptionalRow(sql.select_ai_cluster_assignment_for_instance_question, {
        instance_question_id: instanceQuestionId
    }, z.string().nullable());
}

export async function getAiClusterAssignment({
    assessment_question_id
}: {
    assessment_question_id: string
}) {
    return (await queryRows(sql.select_ai_cluster_assignment,
        {
            assessment_question_id
        },
        z.object({
            cluster_name: z.string(),
            instance_question_id: z.string(),
        })
    )).reduce((acc, { cluster_name, instance_question_id }) => {
        acc[instance_question_id] = cluster_name;
        return acc;
    }, {} as Record<string, string>);
}

/** Retrieve all AI clusters for an assessment question */
export async function getAiClusters({
    assessmentQuestionId
}: {
    assessmentQuestionId: string
}) {
    return await queryRows(sql.select_ai_clusters, {
        assessment_question_id: assessmentQuestionId
    }, AiClusterSchema);
}

/** Generate submission evaluation data for clusters that were generated. */
export async function generateSubmissionEvaluationData({
    assessmentQuestionId
}: {
    assessmentQuestionId: string
}) {
    const clusters = await getAiClusters({ assessmentQuestionId });
    // Generate evaluation data based on the clusters
    const evaluationData = clusters.map(cluster => ({
        clusterId: cluster.id,
        clusterName: cluster.cluster_name,
    }));
    return evaluationData;
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
    include_images_only: false, // This is not a grading request, so we don't need the grading prompt.
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
      content: `CORRECT ANSWER: \n${question_answer}`,
    },
    {
      role: 'user',
      content: `
Identify the student's final answer. Then, identify the student's box answer. Consider the box answer. If the boxed answer exists, response = boxed answer. Else, response = final answer.

Does the student's response match the correct answer exactly? Consider the student's answer exactly as presented - do not give them the benefit of the doubt. 
Must be PRECISELY equivalent to the answer as written - no slight mathematical/notational differences are permitted, even if it is equivalent.

Ensure that all parts of the correct answer are included. Any error in the response will disqualify it from being a correct answer.

If it seems AMBIGUOUS (e.g. a few answers are present, one answer erased out, crossed out), mark it incorrect.

Only evaluate their response, nothing more. Return only a boolean value, true if the answer is correct, false otherwise.
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