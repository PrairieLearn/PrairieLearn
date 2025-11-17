import { type OpenAIResponsesProviderOptions, createOpenAI } from '@ai-sdk/openai';
import { type ModelMessage, generateObject } from 'ai';
import sharp from 'sharp';
import z from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { type OpenAIModelId, formatPrompt } from '../../../lib/ai.js';
import { config } from '../../../lib/config.js';
import type { AssessmentQuestion, Course, InstanceQuestion, Question } from '../../../lib/db-types.js';
import { buildQuestionUrls } from '../../../lib/question-render.js';
import * as questionServers from '../../../question-servers/index.js';
import { generateSubmissionMessage, selectLastVariantAndSubmission } from '../ai-grading/ai-grading-util.js';


const ROTATION_CORRECTION_OPENAI_MODEL = 'gpt-5-mini-2025-08-07' satisfies OpenAIModelId;

export async function aiCorrectRotation({
  course,
  course_instance_id,
  question,
  assessment_question,
  instance_question,
  urlPrefix,
}: {
  course: Course;
  course_instance_id: string;
  question: Question;
  assessment_question: AssessmentQuestion;
  instance_question: InstanceQuestion;
  urlPrefix: string;
}) {
    if (!config.aiGradingOpenAiApiKey || !config.aiGradingOpenAiOrganization) {
        throw new HttpStatusError(403, 'Feature not available.');
    }
    const openai = createOpenAI({
        apiKey: config.aiGradingOpenAiApiKey,
        organization: config.aiGradingOpenAiOrganization,
    });
    const model = openai(ROTATION_CORRECTION_OPENAI_MODEL);

    const { submission, variant } = await selectLastVariantAndSubmission(instance_question.id);
    const locals = {
        ...buildQuestionUrls(urlPrefix, variant, question, instance_question),
        questionRenderContext: 'ai_grading',
    };
    const questionModule = questionServers.getModule(question.type);
    const render_submission_results = await questionModule.render(
        { question: false, submissions: true, answer: true },
        variant,
        question,
        submission,
        [submission],
        course,
        locals,
    );

    const submitted_answer = submission.submitted_answer;
    const submission_text = render_submission_results.data.submissionHtmls[0];

    let uprightInARow = 0;
    let finalImageBase64 = null;
    let finalOrientation: 'Upright' | 'Upside-down' | 'Left-rotated' | 'Right-rotated' = 'Upright';
    const rotationHistory: {
        orientation: 'Upright' | 'Upside-down' | 'Left-rotated' | 'Right-rotated';
        image_base64: string;
    }[] = [];

    for (let i = 0; i < 7; i++) {
        console.log(`Instance question ${instance_question.id} attempt #${i}:`)

        const submissionMessage = generateSubmissionMessage({
            submission_text,
            submitted_answer,
        });

        submissionMessage.content = submissionMessage.content.filter(
            (msg) => msg.type === 'image'
        );

        const input: ModelMessage[] = [
            {
                role: 'system',
                content: formatPrompt([
                    'The provided image is a handwritten student submission.',
                ]),
            },
            submissionMessage,
            {
                role: 'system',
                content: formatPrompt([
                    'Describe the orientation of the handwriting as upright, upside-down, left-rotated 90 degrees, or right-rotated 90 degrees.',
                    "Only use the student's handwriting to determine its orientation. Do not use the background or the page.",
                ])
            },
        ];

        const response = await generateObject({
            model,
            schema: z.object({
                page_orientation: z.enum([
                    'Upright',
                    'Upside-down',
                    'Left-rotated',
                    'Right-rotated',
                ]),
            }),
            messages: input,
            providerOptions: {
                openai: {
                    strictJsonSchema: true,
                    metadata: {
                        course_id: course.id,
                        course_instance_id,
                        assessment_id: assessment_question.assessment_id,
                        assessment_question_id: assessment_question.id,
                        instance_question_id: instance_question.id,
                    },
                    promptCacheKey: `assessment_question_${instance_question.assessment_question_id}_rotation`,
                    safetyIdentifier: `course_${course.id}`,
                } satisfies OpenAIResponsesProviderOptions,
            },
        });

        const fileData = submitted_answer._files[0];
        const orientation = response.object.page_orientation;

        if (i === 0) {
            finalImageBase64 = fileData.contents; 
            finalOrientation = orientation;
        }

        console.log('Orientation:', orientation)

        finalOrientation = orientation;

        // Track consecutive "Upright" responses.
        if (orientation === 'Upright') {
            uprightInARow += 1;
        } else {
            uprightInARow = 0;
        }

        // If AI says "Upright" twice in a row, assume it's correct and stop.
        if (uprightInARow >= 2) {
            console.log(
                'Orientation reported as Upright twice in a row; stopping rotation attempts.'
            );
            break;
        }

        let angle = 0;
        switch (orientation) {
            case 'Upright':
                angle = 0;
                break;
            case 'Upside-down':
                angle = 180;
                break;
            case 'Left-rotated':
                // Page is rotated 90° CCW, so rotate 90° CW to fix.
                angle = 90;
                break;
            case 'Right-rotated':
                // Page is rotated 90° CW, so rotate 90° CCW to fix.
                angle = -90;
                break;
            default:
                angle = 0;
        }

        // Only rotate if we actually need to adjust.
        rotationHistory.push({
            orientation,
            image_base64: submitted_answer._files[0].contents,
        });
        if (angle !== 0) {
            const inputBuffer = Buffer.from(fileData.contents, 'base64');

            const rotatedBuffer = await sharp(inputBuffer)
                .rotate(angle) // clockwise positive
                .toBuffer();

            // Store back as base64 (still no header)
            fileData.contents = rotatedBuffer.toString('base64');
        } else {
            finalImageBase64 = fileData.contents; // We only want to use images that were upright in the end.
            finalOrientation = orientation;
        }
        // Put the file data contents back into submitted_answer
        submitted_answer._files[0] = fileData;
    }


    return {finalImageBase64, finalOrientation, rotationHistory};

}