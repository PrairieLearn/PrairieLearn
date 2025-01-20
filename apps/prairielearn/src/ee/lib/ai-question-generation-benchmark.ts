import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { type OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import * as tmp from 'tmp-promise';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import { AiQuestionGenerationPromptSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { createServerJob } from '../../lib/server-jobs.js';
import { insertCourse } from '../../models/course.js';
import { syncDiskToSql } from '../../sync/syncFromDisk.js';

import { generateQuestion } from './aiQuestionGeneration.js';
import { openAiUserFromAuthn } from './contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.filename);

interface Benchmark {
  promptGeneral: string;
  promptUserInput: string;
  promptGrading: string;
}

const BENCHMARKS: Benchmark[] = [
  {
    promptGeneral:
      'Write a question that asks the user to multiply two integers. You should randomly generate two integers A and B, display them to the user, and then ask the user to provide the product C = A * B.',
    promptUserInput: 'Provide an integer input box for the user to enter the product.',
    promptGrading: 'The correct answer is the product of A and B.',
  },
  {
    promptGeneral:
      'Write a question that asks the user to calculate the area of a rectangle given fixed dimensions.',
    promptUserInput: 'Provide a numeric input box for the user to enter the area.',
    promptGrading: 'The correct answer is the product of the rectangle dimensions.',
  },
  {
    promptGeneral:
      'Write a question that asks the user to identify which of four planets is the third farthest from the sun. The order of planets should be randomized.',
    promptUserInput:
      'Provide a multiple-choice radio button input with four options, including one correct answer and three distractors.',
    promptGrading:
      'The correct answer is "Earth" for this scenario, based on its distance from the sun.',
  },
  {
    promptGeneral:
      'Write a question that asks the user to calculate the greatest common divisor (GCD) of two integers A and B. Randomly generate integers A and B.',
    promptUserInput: 'Provide an integer input box for the user to enter the GCD.',
    promptGrading: 'The correct answer is the GCD of the two randomly generated integers A and B.',
  },
  {
    promptGeneral:
      'Write a question that asks the user to select all prime numbers from a given list of integers. Randomly generate the list to include both primes and non-primes.',
    promptUserInput: 'Provide a checkbox input for the user to select multiple answers.',
    promptGrading: 'The correct answers are all prime numbers in the generated list.',
  },
  {
    promptGeneral:
      'Write a question that asks the user to convert a randomly generated angle from radians to degrees.',
    promptUserInput: 'Provide an integer input box for the user to enter the degree equivalent.',
    promptGrading: 'The correct answer is the degree equivalent of the given angle in radians.',
  },
  {
    promptGeneral:
      'Generate a random polynomial of the form ax + b = c. Ask the student to solve for x.',
    promptUserInput: 'Provide a numerical input box for the user to enter the solution.',
    promptGrading: 'The correct answer is the solution for x (x = (c - b) / a).',
  },
  {
    promptGeneral:
      'Write a question that asks the user to calculate the number of moles given a random mass of a substance and its molar mass. Randomly generate the mass and molar mass.',
    promptUserInput: 'Provide a numeric input box for the user to enter the number of moles.',
    promptGrading:
      'The correct answer is the calculated number of moles using (mass / molar mass).',
  },
  {
    promptGeneral:
      'Write a question that asks the user to calculate the pressure of a gas using the ideal gas law PV = nRT. Randomly generate values for n, V, T, and R.',
    promptUserInput:
      'Provide a numeric input box for the user to enter the pressure in atmospheres.',
    promptGrading: 'The correct answer is the pressure calculated using the ideal gas law.',
  },
  {
    promptGeneral:
      'Write a question that asks the user to calculate the pH of a solution given the concentration of hydrogen ions [H+]. Randomly generate the concentration; use physically realistic values.',
    promptUserInput: 'Provide a numeric input box for the user to enter the pH value.',
    promptGrading:
      'The correct answer is -log10([H+]) for the given concentration of hydrogen ions.',
  },
  // {
  //   promptGeneral: '',
  //   promptUserInput: '',
  //   promptGrading: '',
  // },
];

const QuestionGenerationEvaluationSchema = z.object({
  score: z.number().describe('Score the generated question from 1 (lowest) to 5 (highest).'),
  reasoning: z.string().array().describe('Provide your reasoning for the score.'),
});
type QuestionGenerationEvaluation = z.infer<typeof QuestionGenerationEvaluationSchema>;

export async function benchmarkAiQuestionGeneration({
  client,
  authnUserId,
}: {
  client: OpenAI;
  authnUserId: string;
}): Promise<string> {
  // Safety check: for now, we really only want this to run in dev mode.
  if (!config.devMode) {
    throw new Error('AI question generation benchmarking is only available in dev mode');
  }

  const serverJob = await createServerJob({
    type: 'ai_question_generation_benchmark',
    description: 'Benchmark AI question generation',
    authnUserId,
  });

  serverJob.executeInBackground(async (job) => {
    // We'll create a new course in a temporary directory. This will allow us
    // to preview any generated questions in the UI.
    const courseDirectory = await tmp.dir({
      prefix: 'ai-question-generation-benchmark-',
    });

    // The course must be a git directory for editing to work correctly.
    await execa('git', ['init'], { cwd: courseDirectory.path });

    // Populate an initial `infoCourse.json` file.
    const courseTitle = `AI Question Generation Benchmark ${Date.now()}`;
    const courseName = `ai-question-generation-benchmark-${Date.now()}`;
    await fs.writeJson(path.join(courseDirectory.path, 'infoCourse.json'), {
      uuid: uuidv4(),
      name: courseName,
      title: courseTitle,
      topics: [],
    });
    await execa('git', ['add', 'infoCourse.json'], { cwd: courseDirectory.path });
    await execa('git', ['commit', '-m', 'Initial commit'], { cwd: courseDirectory.path });

    const course = await insertCourse({
      institution_id: '1',
      // Use the unix timestamp as a suffix to make it unique.
      short_name: courseName,
      title: courseTitle,
      display_timezone: 'America/Chicago',
      path: courseDirectory.path,
      repository: null,
      branch: 'master',
      authn_user_id: authnUserId,
    });

    // Sync the course to the database so future edits will do their thing.
    job.info('Syncing course to database');
    const syncResult = await syncDiskToSql(course.id, course.path, job);
    if (syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
      // Sync should never fail when creating a brand new course, if we hit this
      // then we have a problem.
      job.fail('Failed to sync course to database');
      return;
    }

    // Enable the feature flag for this new course.
    await features.enable('ai-question-generation', {
      institution_id: '1',
      course_id: course.id,
    });

    const evaluationResults: QuestionGenerationEvaluation[] = [];

    for (const benchmark of BENCHMARKS) {
      // Generate a single question.
      const result = await generateQuestion({
        client,
        courseId: course.id,
        authnUserId,
        promptGeneral: benchmark.promptGeneral,
        promptUserInput: benchmark.promptUserInput,
        promptGrading: benchmark.promptGrading,
        userId: authnUserId,
        hasCoursePermissionEdit: true,
      });

      const prompts = await queryRows(
        sql.select_ai_question_generation_prompts,
        { question_id: result.questionId },
        AiQuestionGenerationPromptSchema,
      );

      // Log the prompts, responses, and errors for debugging.
      for (const prompt of prompts) {
        job.info('User prompt');
        job.info('======');
        job.info(prompt.user_prompt.trimEnd());
        job.info('\n');

        job.info('Response');
        job.info('========');
        job.info(prompt.response.trimEnd());
        job.info('\n');

        if (prompt.errors?.length) {
          job.error('Errors');
          job.error('======');
          job.error(JSON.stringify(prompt.errors, null, 2));
        } else {
          job.info('No errors detected automatically');
        }
        job.error('\n');
      }

      const evaluationResult = await evaluateGeneratedQuestion({
        client,
        authnUserId,
        userPrompt: prompts[0].user_prompt,
        html: result.htmlResult ?? '',
        python: result.pythonResult ?? '',
      });
      job.info('Evaluation result');
      job.info('=================');
      if (!evaluationResult) {
        job.error('No evaluation result returned.');
      } else {
        evaluationResults.push(evaluationResult);
        job.info(`Score: ${evaluationResult.score}`);
        job.info('Reasoning:');
        for (const line of evaluationResult.reasoning) {
          job.info(line);
        }
      }
      job.info('');
    }

    const scores = evaluationResults.map((result) => result.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    const avgScore = totalScore / scores.length;
    const totalPoints = scores.length * 5;

    job.info('==================');
    job.info('Benchmark complete');
    job.info(`Min score: ${minScore}`);
    job.info(`Max score: ${maxScore}`);
    job.info(`Average score: ${avgScore}`);
    job.info(`Overall score: ${totalScore}/${totalPoints} (${(totalScore / totalPoints) * 100}%)`);
  });

  return serverJob.jobSequenceId;
}

async function evaluateGeneratedQuestion({
  client,
  authnUserId,
  userPrompt,
  html,
  python,
}: {
  client: OpenAI;
  authnUserId: string;
  userPrompt: string;
  html: string;
  python: string;
}): Promise<QuestionGenerationEvaluation | null> {
  const systemPrompt = [
    'Another LLM has generated a PrairieLearn question from the following prompt:',
    '',
    '<prompt>',
    userPrompt
      .split('\n')
      .map((line) => line.trim())
      .join('\n'),
    '</prompt>',
    '',
    'Please evaluate it for correctness and clarity.',
    'If anything is incorrect or could be improved, please provide feedback.',
    'If the question looks fine, please indicate that as well.',
    '',
    'Do not suggest ways the original prompt could have been improved.',
    'You should evaluate the question based on the prompt as it is written.',
    '',
    'The user will now provide the question HTML and Python files that the LLM generated for this prompt.',
  ].join('\n');

  const generatedQuestion: string[] = ['```html', html.trim(), '```'];
  if (python) {
    generatedQuestion.push('', '```python', python.trim(), '```');
  } else {
    generatedQuestion.push('', 'No Python file was generated.');
  }

  const completion = await client.beta.chat.completions.parse({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: generatedQuestion.join('\n') },
    ],
    response_format: zodResponseFormat(
      QuestionGenerationEvaluationSchema,
      'question_generation_evaluation',
    ),
    user: openAiUserFromAuthn(authnUserId),
  });

  return completion.choices[0].message.parsed;
}
