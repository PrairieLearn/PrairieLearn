import path from 'node:path';

import fs from 'fs-extra';

import { config } from '../../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { type QuestionsPageData } from '../../models/questions.js';
import { loadQuestions } from '../../sync/course-db.js';

const TEMPLATE_QID_PREFIX = 'template/';

const TEMPLATE_ASSESSMENT_PATH = path.join(
  'courseInstances',
  'SectionA',
  'assessments',
  'questionTemplates',
  'infoAssessment.json',
);

export interface TemplateQuestion {
  qid: string;
  title: string;
  readme: string | null;
}

export interface TemplateQuestionZone {
  title: string;
  questions: TemplateQuestion[];
}

export interface TemplateQuestionsData {
  exampleCourseZones: TemplateQuestionZone[];
  courseTemplates: { qid: string; title: string }[];
}

let cachedExampleCourseZones: TemplateQuestionZone[] | null = null;

/**
 * Get template questions from the example course, categorized into zones
 * based on the `questionTemplates` assessment. While it should typically be
 * possible to retrieve these from the database, these are retrieved from
 * the filesystem for the following reasons:
 * 1. There is no guarantee that the example course will actually be synced in
 *    the current environment. The local installation (dev or prod) may have
 *    removed it from the sync process.
 * 2. The synced example course may not be up-to-date with the source example
 *    course questions, and we want to use the latest version.
 * 3. The current method of identifying an example course is based on
 *    information that may be forgeable by setting specific values in the course
 *    info file, which could lead to a security vulnerability if we were to rely
 *    on the database.
 */
async function getExampleCourseZones(): Promise<TemplateQuestionZone[]> {
  if (!config.devMode && cachedExampleCourseZones) {
    return cachedExampleCourseZones;
  }

  const questions = await loadQuestions({
    coursePath: EXAMPLE_COURSE_PATH,
    // We don't actually care about sharing settings here, but we do use shared
    // questions in the example course, so we'll flag sharing as enabled.
    sharingEnabled: true,
  });

  // Build a lookup map of qid → title for template questions.
  const questionTitleMap = new Map<string, string>();
  for (const [qid, question] of Object.entries(questions)) {
    if (qid.startsWith(TEMPLATE_QID_PREFIX) && question.data?.title) {
      questionTitleMap.set(qid, question.data.title);
    }
  }

  // Read the assessment file for zone categorization.
  const assessmentPath = path.join(EXAMPLE_COURSE_PATH, TEMPLATE_ASSESSMENT_PATH);
  let zones: TemplateQuestionZone[];
  try {
    const assessmentData = await fs.readJson(assessmentPath);
    zones = await buildZonesFromAssessment(assessmentData, questionTitleMap);
  } catch {
    // If the assessment file is missing or malformed, fall back to a flat list.
    zones = await buildFlatZone(questionTitleMap);
  }

  if (!config.devMode) {
    cachedExampleCourseZones = zones;
  }

  return zones;
}

async function buildZonesFromAssessment(
  assessmentData: { zones?: { title: string; questions: { id: string }[] }[] },
  questionTitleMap: Map<string, string>,
): Promise<TemplateQuestionZone[]> {
  if (!assessmentData.zones?.length) {
    return buildFlatZone(questionTitleMap);
  }

  const zones: TemplateQuestionZone[] = [];

  for (const zone of assessmentData.zones) {
    const questions: TemplateQuestion[] = [];

    for (const { id: qid } of zone.questions) {
      const title = questionTitleMap.get(qid);
      if (!title) continue;

      const readme = await readTemplateReadme(qid);
      questions.push({ qid, title, readme });
    }

    if (questions.length > 0) {
      zones.push({ title: zone.title, questions });
    }
  }

  return zones;
}

async function buildFlatZone(
  questionTitleMap: Map<string, string>,
): Promise<TemplateQuestionZone[]> {
  const questions: TemplateQuestion[] = [];

  for (const [qid, title] of questionTitleMap) {
    const readme = await readTemplateReadme(qid);
    questions.push({ qid, title, readme });
  }

  questions.sort((a, b) => a.title.localeCompare(b.title));

  if (questions.length === 0) return [];

  return [{ title: 'Templates', questions }];
}

async function readTemplateReadme(qid: string): Promise<string | null> {
  const readmePath = path.join(EXAMPLE_COURSE_PATH, 'questions', qid, 'README.md');
  try {
    return await fs.readFile(readmePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Get template questions that can be used as starting points for new
 * questions, from both the example course (categorized into zones) and
 * course-specific templates (flat list).
 */
export async function getTemplateQuestions(
  questions: QuestionsPageData[],
): Promise<TemplateQuestionsData> {
  const exampleCourseZones = await getExampleCourseZones();
  const courseTemplates = questions
    .filter(({ qid }) => qid.startsWith(TEMPLATE_QID_PREFIX))
    .map(({ qid, title }) => ({ qid, title }));

  return { exampleCourseZones, courseTemplates };
}
