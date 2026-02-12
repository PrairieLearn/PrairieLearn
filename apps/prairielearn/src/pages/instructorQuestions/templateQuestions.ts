import { config } from '../../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { type QuestionsPageData } from '../../models/questions.types.js';
import { loadQuestions } from '../../sync/course-db.js';

const TEMPLATE_QID_PREFIX = 'template/';

let cachedTemplateQuestionExampleCourse: { qid: string; title: string }[] | null = null;

/**
 * Get a list of template question from the example course. While it should
 * typically be possible to retrieve these from the database, these are
 * retrieved from the filesystem for the following reasons:
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
async function getTemplateQuestionsExampleCourse() {
  if (!config.devMode && cachedTemplateQuestionExampleCourse) {
    return cachedTemplateQuestionExampleCourse;
  }

  const questions = await loadQuestions({
    coursePath: EXAMPLE_COURSE_PATH,
    // We don't actually care about sharing settings here, but we do use shared
    // questions in the example course, so we'll flag sharing as enabled.
    sharingEnabled: true,
  });

  const templateQuestions = Object.entries(questions)
    .map(([qid, question]) => ({ qid, title: question.data?.title }))
    .filter(({ qid, title }) => qid.startsWith(TEMPLATE_QID_PREFIX) && title !== undefined) as {
    qid: string;
    title: string;
  }[];

  const sortedTemplateQuestionOptions = templateQuestions.sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  if (!config.devMode) {
    cachedTemplateQuestionExampleCourse = sortedTemplateQuestionOptions;
  }

  return sortedTemplateQuestionOptions;
}

/**
 * Get a list of template question qids and titles that can be used as starting
 * points for new questions, both from the example course and course-specific
 * templates.
 */
export async function getTemplateQuestions(questions: QuestionsPageData[]) {
  const exampleCourseTemplateQuestions = await getTemplateQuestionsExampleCourse();
  const courseTemplateQuestions = questions
    .filter(({ qid }) => qid.startsWith(TEMPLATE_QID_PREFIX))
    .map(({ qid, title }) => ({ example_course: false, qid, title }));
  return [
    ...exampleCourseTemplateQuestions.map((q) => ({ example_course: true, ...q })),
    ...courseTemplateQuestions,
  ];
}
