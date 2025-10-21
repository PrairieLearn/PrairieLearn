import type {
  EmbeddingModel,
  GenerateObjectResult,
  GenerateTextResult,
  ModelMessage,
  UserContent,
} from 'ai';
import * as cheerio from 'cheerio';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import { type OpenAIModelId, calculateResponseCost, formatPrompt } from '../../../lib/ai.js';
import { computeAssessmentInstanceScore } from '../../../lib/assessment.js';
import {
  AssessmentQuestionSchema,
  type Course,
  GradingJobSchema,
  IdSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  type Question,
  type RubricItem,
  RubricItemSchema,
  type Submission,
  type SubmissionGradingContextEmbedding,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  type Variant,
  VariantSchema,
} from '../../../lib/db-types.js';
import * as ltiOutcomes from '../../../lib/ltiOutcomes.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import { getQuestionCourse } from '../../../lib/question-variant.js';
import * as questionServers from '../../../question-servers/index.js';
import { createEmbedding, vectorToString } from '../contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);

export const AI_GRADING_OPENAI_MODEL = 'gpt-5-mini-2025-08-07' satisfies OpenAIModelId;

export const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
export const GradedExampleSchema = z.object({
  submission_text: z.string(),
  score_perc: z.number(),
  feedback: z.record(z.string(), z.any()).nullable(),
  instance_question_id: z.string(),
  manual_rubric_grading_id: z.string().nullable(),
});
export type GradedExample = z.infer<typeof GradedExampleSchema>;

export async function generatePrompt({
  questionPrompt,
  questionAnswer,
  submission_text,
  submitted_answer,
  example_submissions,
  rubric_items,
}: {
  questionPrompt: string;
  questionAnswer: string;
  submission_text: string;
  submitted_answer: Record<string, any> | null;
  example_submissions: GradedExample[];
  rubric_items: RubricItem[];
}): Promise<ModelMessage[]> {
  const input: ModelMessage[] = [];

  // Instructions for grading
  if (rubric_items.length > 0) {
    input.push(
      {
        role: 'system',
        content: formatPrompt([
          [
            "You are an instructor for a course, and you are grading a student's response to a question.",
            'You are provided several rubric items with a description, explanation, and grader note.',
            "You must grade the student's response by using the rubric and returning an object of rubric descriptions and whether or not that rubric item applies to the student's response.",
            'If no rubric items apply, do not select any.',
            'You must include an explanation on why you make these choices.',
            'Follow any special instructions given by the instructor in the question.',
          ],
          'Here are the rubric items:',
        ]),
      },
      {
        role: 'user',
        content: rubric_items
          .map((item) => {
            const itemParts: string[] = [`description: ${item.description}`];
            if (item.explanation) {
              itemParts.push(`explanation: ${item.explanation}`);
            }
            if (item.grader_note) {
              itemParts.push(`grader note: ${item.grader_note}`);
            }
            return itemParts.join('\n');
          })
          .join('\n\n'),
      },
    );
  } else {
    input.push({
      role: 'system',
      content: formatPrompt([
        "You are an instructor for a course, and you are grading a student's response to a question.",
        'You will assign a numeric score between 0 and 100 (inclusive) to the student response,',
        "Include feedback for the student, but omit the feedback if the student's response is entirely correct.",
        'You must include an explanation on why you made these choices.',
        'Follow any special instructions given by the instructor in the question.',
      ]),
    });
  }

  input.push(
    {
      role: 'system',
      content: 'This is the question for which you will be grading a response:',
    },
    {
      role: 'user',
      content: questionPrompt,
    },
  );

  if (questionAnswer.trim()) {
    input.push(
      {
        role: 'system',
        content: 'The instructor has provided the following answer for this question:',
      },
      {
        role: 'user',
        content: questionAnswer.trim(),
      },
    );
  }

  if (example_submissions.length > 0) {
    if (rubric_items.length > 0) {
      input.push({
        role: 'system',
        content:
          'Here are some example student responses and their corresponding selected rubric items.',
      });
    } else {
      input.push({
        role: 'system',
        content:
          'Here are some example student responses and their corresponding scores and feedback.',
      });
    }

    // Examples
    for (const example of example_submissions) {
      if (rubric_items.length > 0 && example.manual_rubric_grading_id) {
        // Note that the example may have been graded with a different rubric,
        // or the rubric may have changed significantly since the example was graded.
        // We'll show whatever items were selected anyways, since it'll likely
        // still be useful context to the LLM.
        const rubric_grading_items = await selectRubricGradingItems(
          example.manual_rubric_grading_id,
        );
        input.push({
          role: 'user',
          content: formatPrompt([
            '<example-submission>',
            example.submission_text,
            '</example-submission>',
            '<selected-rubric-items>',
            run(() => {
              if (rubric_grading_items.length === 0) {
                return 'No rubric items were selected for this example student response.';
              }
              return rubric_grading_items.map((item) => `- ${item.description}`).join('\n');
            }),
            '</selected-rubric-items>',
          ]),
        });
      } else {
        input.push({
          role: 'user',
          content: formatPrompt([
            '<example-submission>',
            example.submission_text,
            '</example-submission>',
            '<grading-result>',
            JSON.stringify(
              {
                score: example.score_perc,
                feedback: example.feedback?.manual?.trim() || '',
              },
              null,
              2,
            ),
            '</grading-result>',
          ]),
        });
      }
    }
  }

  input.push(
    {
      role: 'system',
      content: 'The student made the following submission:',
    },
    generateSubmissionMessage({
      submission_text,
      submitted_answer,
    }),
    {
      role: 'system',
      content: 'Please grade the submission according to the above instructions.',
    },
  );

  return input;
}

/**
 * Returns true if the text contains any element with a `data-image-capture-uuid` attribute.
 */
export function containsImageCapture(submission_text: string): boolean {
  return cheerio.load(submission_text)('[data-image-capture-uuid]').length > 0;
}

/**
 * Parses the student's answer and the HTML of the student's submission to generate a message for the AI model.
 *
 * @param options
 * @param options.submission_text - The rendered HTML content of the student's submission.
 * @param options.submitted_answer - The student-submitted answer, potentially containing text and images.
 */
export function generateSubmissionMessage({
  submission_text,
  submitted_answer,
}: {
  submission_text: string;
  submitted_answer: Record<string, any> | null;
}): ModelMessage {
  const content: UserContent = [];

  // Walk through the submitted HTML from top to bottom, appending alternating text and image segments
  // to the message content to construct an AI-readable version of the submission.

  const $submission_html = cheerio.load(submission_text);
  let submissionTextSegment = '';

  $submission_html
    .root()
    .find('body')
    .contents()
    .each((_, node) => {
      const imageCaptureUUID = $submission_html(node).data('image-capture-uuid');
      if (imageCaptureUUID) {
        if (submissionTextSegment) {
          // Push and reset the current text segment before adding the image.
          content.push({
            type: 'text',
            text: submissionTextSegment.trim(),
          });
          submissionTextSegment = '';
        }

        const fileName = run(() => {
          // New style, where `<pl-image-capture>` has been specialized for AI grading rendering.
          const submittedFileName = $submission_html(node).data('file-name');
          if (submittedFileName && typeof submittedFileName === 'string') {
            return submittedFileName.trim();
          }

          // Old style, where we have to pick the filename out of the `data-options` attribute.
          const options = $submission_html(node).data('options') as Record<string, string> | null;

          return options?.submitted_file_name;
        });

        if (!submitted_answer) {
          throw new Error('No submitted answers found.');
        }

        if (!fileName) {
          throw new Error('No file name found.');
        }

        const fileData = submitted_answer._files?.find((file) => file.name === fileName);

        if (fileData) {
          // fileData.contents does not contain the MIME type header, so we add it.
          content.push({
            type: 'image',
            image: `data:image/jpeg;base64,${fileData.contents}`,
            providerOptions: {
              openai: {
                imageDetail: 'auto',
              },
            },
          });
        } else {
          // If the submitted answer doesn't contain the image, the student likely
          // didn't capture an image.
          content.push({
            type: 'text',
            text: `Image capture with ${fileName} was not captured.`,
          });
          return;
        }
      } else {
        submissionTextSegment += $submission_html(node).text();
      }
    });

  if (submissionTextSegment) {
    content.push({
      type: 'text',
      text: submissionTextSegment.trim(),
    });
  }

  return {
    role: 'user',
    content,
  };
}

export async function generateSubmissionEmbedding({
  course,
  question,
  instance_question,
  urlPrefix,
  embeddingModel,
}: {
  question: Question;
  course: Course;
  instance_question: InstanceQuestion;
  urlPrefix: string;
  embeddingModel: EmbeddingModel;
}): Promise<SubmissionGradingContextEmbedding> {
  const question_course = await getQuestionCourse(question, course);
  const { variant, submission } = await selectLastVariantAndSubmission(instance_question.id);
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
    question_course,
    locals,
  );
  const submission_text = render_submission_results.data.submissionHtmls[0];
  const embedding = await createEmbedding(embeddingModel, submission_text, `course_${course.id}`);
  // Insert new embedding into the table and return the new embedding
  const new_submission_embedding = await queryRow(
    sql.create_embedding_for_submission,
    {
      embedding: vectorToString(embedding),
      submission_id: submission.id,
      submission_text,
      assessment_question_id: instance_question.assessment_question_id,
    },
    SubmissionGradingContextEmbeddingSchema,
  );
  return new_submission_embedding;
}

export function parseAiRubricItems({
  ai_rubric_items,
  rubric_items,
}: {
  ai_rubric_items: Record<string, boolean>;
  rubric_items: RubricItem[];
}): {
  appliedRubricItems: {
    rubric_item_id: string;
  }[];
  appliedRubricDescription: Set<string>;
} {
  // Compute the set of selected rubric descriptions.
  const appliedRubricDescription = new Set<string>();
  Object.entries(ai_rubric_items).forEach(([description, selected]) => {
    if (selected) {
      appliedRubricDescription.add(description);
    }
  });

  // Build a lookup table for rubric items by description.
  const rubricItemsByDescription: Record<string, RubricItem> = {};
  for (const item of rubric_items) {
    rubricItemsByDescription[item.description] = item;
  }

  // It's possible that the rubric could have changed since we last
  // fetched it. We'll optimistically apply all the rubric items
  // that were selected. If an item was deleted, we'll allow the
  // grading to fail; the user can then try again.
  const appliedRubricItems = Array.from(appliedRubricDescription).map((description) => ({
    rubric_item_id: rubricItemsByDescription[description].id,
  }));
  return { appliedRubricItems, appliedRubricDescription };
}

export async function selectInstanceQuestionsForAssessmentQuestion({
  assessment_question_id,
  closed_instance_questions_only = false,
  ungrouped_instance_questions_only = false,
}: {
  assessment_question_id: string;
  closed_instance_questions_only?: boolean;
  ungrouped_instance_questions_only?: boolean;
}): Promise<InstanceQuestion[]> {
  return await queryRows(
    sql.select_instance_questions_for_assessment_question,
    { assessment_question_id, closed_instance_questions_only, ungrouped_instance_questions_only },
    InstanceQuestionSchema,
  );
}

export async function selectRubricGradingItems(
  manual_rubric_grading_id: string | null,
): Promise<RubricItem[]> {
  return await queryRows(
    sql.select_rubric_grading_items,
    { manual_rubric_grading_id },
    RubricItemSchema,
  );
}

export async function insertAiGradingJob({
  grading_job_id,
  job_sequence_id,
  prompt,
  response,
  course_id,
  course_instance_id,
}: {
  grading_job_id: string;
  job_sequence_id: string;
  prompt: ModelMessage[];
  response: GenerateObjectResult<any> | GenerateTextResult<any, any>;
  course_id: string;
  course_instance_id?: string;
}): Promise<void> {
  await execute(sql.insert_ai_grading_job, {
    grading_job_id,
    job_sequence_id,
    prompt: JSON.stringify(prompt),
    completion: response,
    model: AI_GRADING_OPENAI_MODEL,
    prompt_tokens: response.usage.inputTokens ?? 0,
    completion_tokens: response.usage.outputTokens ?? 0,
    cost: calculateResponseCost({ model: AI_GRADING_OPENAI_MODEL, usage: response.usage }),
    course_id,
    course_instance_id,
  });
}

export async function selectLastVariantAndSubmission(
  instance_question_id: string,
): Promise<{ variant: Variant; submission: Submission }> {
  return await queryRow(
    sql.select_last_variant_and_submission,
    { instance_question_id },
    SubmissionVariantSchema,
  );
}

export async function selectClosestSubmissionInfo({
  submission_id,
  assessment_question_id,
  embedding,
  limit,
}: {
  submission_id: string;
  assessment_question_id: string;
  embedding: string;
  limit: number;
}): Promise<GradedExample[]> {
  return await queryRows(
    sql.select_closest_submission_info,
    {
      submission_id,
      assessment_question_id,
      embedding,
      limit,
    },
    GradedExampleSchema,
  );
}

export async function selectRubricForGrading(
  assessment_question_id: string,
): Promise<RubricItem[]> {
  return await queryRows(
    sql.select_rubric_for_grading,
    { assessment_question_id },
    RubricItemSchema,
  );
}

export async function selectLastSubmissionId(instance_question_id: string): Promise<string> {
  return await queryRow(sql.select_last_submission_id, { instance_question_id }, IdSchema);
}

export async function selectEmbeddingForSubmission(
  submission_id: string,
): Promise<SubmissionGradingContextEmbedding | null> {
  return await queryOptionalRow(
    sql.select_embedding_for_submission,
    { submission_id },
    SubmissionGradingContextEmbeddingSchema,
  );
}

export async function deleteAiGradingJobs({
  assessment_question_ids,
  authn_user_id,
}: {
  assessment_question_ids: string[];
  authn_user_id: string;
}) {
  // TODO: revisit this before general availability of AI grading. This implementation
  // was added primarily to facilitate demos at ASEE 2025. It may not behave completely
  // correctly in call cases; see the TODOs in the SQL query for more details.
  //
  // TODO: we should add locking here. Specifically, we should process each
  // assessment instance + instance question one at a time in separate
  // transactions so that we don't need to lock all relevant assessment instances
  // and assessment questions at once.
  const iqs = await runInTransactionAsync(async () => {
    const iqs = await queryRows(
      sql.delete_ai_grading_jobs,
      {
        authn_user_id,
        assessment_question_ids,
      },
      z.object({
        id: IdSchema,
        assessment_instance_id: IdSchema,
        max_points: AssessmentQuestionSchema.shape.max_points,
        max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
        max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
        points: InstanceQuestionSchema.shape.points,
        score_perc: InstanceQuestionSchema.shape.score_perc,
        auto_points: InstanceQuestionSchema.shape.auto_points,
        manual_points: InstanceQuestionSchema.shape.manual_points,
        most_recent_manual_grading_job: GradingJobSchema.nullable(),
      }),
    );

    for (const iq of iqs) {
      await computeAssessmentInstanceScore({
        assessment_instance_id: iq.assessment_instance_id,
        // We use the user who is performing the deletion.
        authn_user_id,
        credit: 100,
        allowDecrease: true,
      });
    }

    return iqs;
  });

  // Important: this is done outside of the above transaction so that we don't
  // hold a database connection open while we do network calls.
  //
  // This is here for consistency with other assessment score updating code. We
  // shouldn't hit this for the vast majority of assessments.
  for (const iq of iqs) {
    await ltiOutcomes.updateScore(iq.assessment_instance_id);
  }

  return iqs;
}

export async function toggleAiGradingMode(assessment_question_id: string): Promise<void> {
  await execute(sql.toggle_ai_grading_mode, { assessment_question_id });
}
