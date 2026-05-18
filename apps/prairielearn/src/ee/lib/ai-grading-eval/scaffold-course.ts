import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';

import { type Course, type User } from '../../../lib/db-types.js';
import { type ServerJob } from '../../../lib/server-jobs.js';
import { insertCourse } from '../../../models/course.js';
import { syncDiskToSql } from '../../../sync/syncFromDisk.js';

import { type EvalsManifest, type LoadedEval } from './manifest.js';

export const EVAL_COURSES_ROOT = path.join(os.tmpdir(), 'prairielearn-ai-grading-evals', 'courses');

export const EVAL_COURSE_INSTANCE_SHORT_NAME = 'evals';

const TOPIC_COLOR_PALETTE = [
  'red1',
  'red2',
  'red3',
  'pink1',
  'pink2',
  'pink3',
  'purple1',
  'purple2',
  'purple3',
  'blue1',
  'blue2',
  'blue3',
  'turquoise1',
  'turquoise2',
  'turquoise3',
  'green1',
  'green2',
  'green3',
  'yellow1',
  'yellow2',
  'yellow3',
  'orange1',
  'orange2',
  'orange3',
  'brown1',
  'brown2',
  'brown3',
  'gray1',
  'gray2',
  'gray3',
];

interface QuestionInfoForTopic {
  topic?: unknown;
}

function collectTopicNames(infos: QuestionInfoForTopic[]): string[] {
  const names = new Set<string>();
  for (const info of infos) {
    if (typeof info.topic === 'string' && info.topic.length > 0) {
      names.add(info.topic);
    }
  }
  return [...names];
}

export interface ScaffoldedCourse {
  course: Course;
  coursePath: string;
  courseInstanceShortName: string;
}

/**
 * Materializes a synthetic PrairieLearn course from the contents of the eval
 * repo. The course contains one course instance ("evals") with one assessment
 * per eval entry; each assessment has the single matching question on it.
 *
 * Modeled on `benchmarkAiQuestionGeneration`: tmp dir, `git init`, write
 * `infoCourse.json`, sync to DB.
 */
export async function scaffoldCourse({
  manifest,
  evals,
  evalsDir,
  user,
  job,
}: {
  manifest: EvalsManifest;
  evals: LoadedEval[];
  evalsDir: string;
  user: User;
  job: ServerJob;
}): Promise<ScaffoldedCourse> {
  const runId = `ai-grading-evals-${Date.now()}`;
  const coursePath = path.join(EVAL_COURSES_ROOT, runId);
  await fs.ensureDir(EVAL_COURSES_ROOT);
  await fs.ensureDir(coursePath);
  job.info(`Scaffolding synthetic course at ${coursePath}`);

  await execa('git', ['init', '-b', 'master'], { cwd: coursePath });

  const questionInfos: QuestionInfoForTopic[] = [];
  for (const loaded of evals) {
    const info = await fs.readJson(path.join(loaded.absoluteDir, 'info.json'));
    questionInfos.push(info);
  }
  const topicNames = collectTopicNames(questionInfos);
  const topics = topicNames.map((name, idx) => ({
    name,
    color: TOPIC_COLOR_PALETTE[idx % TOPIC_COLOR_PALETTE.length],
  }));

  const courseTitle = `AI Grading Evals (${manifest.name}) ${runId}`;
  await fs.writeJson(
    path.join(coursePath, 'infoCourse.json'),
    {
      uuid: crypto.randomUUID(),
      name: runId,
      title: courseTitle,
      topics,
    },
    { spaces: 2 },
  );

  for (const subdir of ['serverFilesCourse', 'elements'] as const) {
    const src = path.join(evalsDir, subdir);
    if (await fs.pathExists(src)) {
      job.info(`Copying ${subdir}/ from eval repo`);
      await fs.copy(src, path.join(coursePath, subdir));
    }
  }

  for (const loaded of evals) {
    const destDir = path.join(coursePath, 'questions', loaded.entry.id);
    await fs.ensureDir(destDir);
    for (const file of ['info.json', 'question.html', 'server.py']) {
      await fs.copy(path.join(loaded.absoluteDir, file), path.join(destDir, file));
    }
  }

  const courseInstanceDir = path.join(
    coursePath,
    'courseInstances',
    EVAL_COURSE_INSTANCE_SHORT_NAME,
  );
  await fs.ensureDir(courseInstanceDir);
  await fs.writeJson(
    path.join(courseInstanceDir, 'infoCourseInstance.json'),
    {
      uuid: crypto.randomUUID(),
      longName: `Evals ${runId}`,
    },
    { spaces: 2 },
  );

  for (const [idx, loaded] of evals.entries()) {
    const assessmentDir = path.join(courseInstanceDir, 'assessments', loaded.entry.id);
    await fs.ensureDir(assessmentDir);
    await fs.writeJson(
      path.join(assessmentDir, 'infoAssessment.json'),
      {
        uuid: crypto.randomUUID(),
        type: 'Homework',
        title: loaded.entry.id,
        set: 'Homework',
        number: String(idx + 1),
        allowAccess: [{ mode: 'Public' }],
        zones: [
          {
            title: 'Eval',
            questions: [{ id: loaded.entry.id, points: loaded.entry.max_points }],
          },
        ],
      },
      { spaces: 2 },
    );
  }

  await execa('git', ['add', '.'], { cwd: coursePath });
  await execa(
    'git',
    [
      '-c',
      'user.email=ai-grading-eval@prairielearn.local',
      '-c',
      'user.name=AI Grading Eval',
      'commit',
      '-m',
      'Initial scaffold',
    ],
    {
      cwd: coursePath,
    },
  );

  job.info('Inserting course row');
  const course = await insertCourse({
    institution_id: '1',
    short_name: runId,
    title: courseTitle,
    display_timezone: 'America/Chicago',
    path: coursePath,
    repository: null,
    branch: 'master',
    authn_user_id: user.id,
  });

  job.info('Syncing scaffolded course to database');
  const syncResult = await syncDiskToSql(course, job);
  if (syncResult.status !== 'complete' || syncResult.hadJsonErrorsOrWarnings) {
    job.fail('Failed to sync scaffolded course to database');
  }

  return {
    course,
    coursePath,
    courseInstanceShortName: EVAL_COURSE_INSTANCE_SHORT_NAME,
  };
}
