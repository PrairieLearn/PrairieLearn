// @ts-check
const sqldb = require('@prairielearn/postgres');

const infofile = require('../infofile');
const perf = require('../performance')('tags');

/**
 * @param {any} courseId
 * @param {import('../course-db').CourseData} courseData
 * @param {{ [qid: string]: any }} questionIds
 */
module.exports.sync = async function (courseId, courseData, questionIds) {
  // We can only safely remove unused tags if both `infoCourse.json` and all
  // question `info.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoQuestionsValid = Object.values(courseData.questions).every(
    (q) => !infofile.hasErrors(q)
  );
  const deleteUnused = isInfoCourseValid && areAllInfoQuestionsValid;

  /** @type {string[]} */
  let courseTags = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseTags = (courseData.course.data?.tags ?? []).map((t) =>
      JSON.stringify([t.name, t.description, t.color])
    );
  }

  /** @type Set<string> */
  const knownQuestionTagsNames = new Set();
  Object.values(courseData.questions).forEach((q) => {
    if (!infofile.hasErrors(q)) {
      (q.data?.tags ?? []).forEach((t) => knownQuestionTagsNames.add(t));
    }
  });
  const questionTagNames = [...knownQuestionTagsNames];

  const params = [
    !infofile.hasErrors(courseData.course),
    deleteUnused,
    courseTags,
    questionTagNames,
    courseId,
  ];

  perf.start('sproc:sync_course_tags');
  const res = await sqldb.callOneRowAsync('sync_course_tags', params);
  perf.end('sproc:sync_course_tags');

  /** @type {[string, any][]} */
  const newTags = res.rows[0].new_tags_json;
  const tagIdsByName = newTags.reduce((acc, [name, id]) => {
    acc.set(name, id);
    return acc;
  }, /** @type {Map<String, any>} */ (new Map()));

  /** @type {string[]} */
  const questionTagsParam = [];
  Object.entries(courseData.questions).forEach(([qid, question]) => {
    if (infofile.hasErrors(question)) return;
    /** @type {Set<string>} */
    const dedupedQuestionTagNames = new Set();
    (question.data?.tags ?? []).forEach((t) => dedupedQuestionTagNames.add(t));
    const questionTagIds = [...dedupedQuestionTagNames].map((t) => tagIdsByName.get(t));
    questionTagsParam.push(JSON.stringify([questionIds[qid], questionTagIds]));
  });

  perf.start('sproc:sync_question_tags');
  await sqldb.callAsync('sync_question_tags', [questionTagsParam]);
  perf.end('sproc:sync_question_tags');
};
