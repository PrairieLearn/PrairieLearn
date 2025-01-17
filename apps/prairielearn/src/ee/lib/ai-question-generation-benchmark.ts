import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { type OpenAI } from 'openai';
import * as tmp from 'tmp-promise';
import { v4 as uuidv4 } from 'uuid';

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

    // Generate a single question.
    const result = await generateQuestion({
      client,
      courseId: course.id,
      authnUserId,
      promptGeneral:
        'Write a question that asks the user to multiply two integers. You should randomly generate two integers A and B, display them to the user, and then ask the user to provide the product C = A * B.',
      promptUserInput: 'Provide an integer input box for the user to enter the product.',
      promptGrading: 'The correct answer is the product of A and B.',
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
    job.info(evaluationResult?.trimEnd() ?? 'No evaluation result returned');
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
}) {
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
    'The user will now provide the question HTML and Python files that the LLM generated for this prompt.',
  ].join('\n');

  const generatedQuestion: string[] = ['```html', html.trim(), '```'];
  if (python) {
    generatedQuestion.push('', '```python', python.trim(), '```');
  }

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: generatedQuestion.join('\n') },
    ],
    user: openAiUserFromAuthn(authnUserId),
  });

  return completion.choices[0].message.content;
}
