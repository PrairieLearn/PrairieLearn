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
import { createServerJob, getJobSequence } from '../../lib/server-jobs.js';
import { insertCourse } from '../../models/course.js';
import { syncDiskToSql } from '../../sync/syncFromDisk.js';

import { generateQuestion } from './aiQuestionGeneration.js';

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
      promptGeneral: '',
      promptUserInput: '',
      promptGrading: '',
      userId: authnUserId,
      hasCoursePermissionEdit: true,
    });

    const generationJobSequence = await getJobSequence(result.jobSequenceId, course.id);

    job.info('Job sequence output:');
    job.info('==========');
    job.info(generationJobSequence.jobs[0].output ?? '');
    job.info('==========');

    const prompts = await queryRows(
      sql.select_ai_question_generation_prompts,
      { question_id: result.questionId },
      AiQuestionGenerationPromptSchema,
    );

    job.info(JSON.stringify(prompts, null, 2));

    if (result.htmlResult) {
      job.info('Generated question.html');
      job.info(result.htmlResult);
    } else {
      job.error('Did not generate question.html');
    }

    if (result.pythonResult) {
      job.info('Generated question.py');
      job.info(result.pythonResult);
    }
  });

  return serverJob.jobSequenceId;
}
