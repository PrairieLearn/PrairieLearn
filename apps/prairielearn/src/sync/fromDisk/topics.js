// @ts-check
const sqldb = require('@prairielearn/postgres');

const infofile = require('../infofile');
const perf = require('../performance')('topics');

/**
 * @param {import('../course-db').CourseData} courseData
 */
module.exports.sync = async function (courseId, courseData) {
  // We can only safely remove unused topics if both `infoCourse.json` and all
  // question `info.json` files are valid.
  const isInfoCourseValid = !infofile.hasErrors(courseData.course);
  const areAllInfoQuestionsValid = Object.values(courseData.questions).every(
    (q) => !infofile.hasErrors(q)
  );
  const deleteUnused = isInfoCourseValid && areAllInfoQuestionsValid;

  /** @type {string[]} */
  let courseTopics = [];
  if (!infofile.hasErrors(courseData.course)) {
    courseTopics = (courseData.course.data?.topics ?? []).map((t) =>
      JSON.stringify([t.name, t.description, t.color])
    );
  }

  /** @type Set<string> */
  const knownQuestionTopicNames = new Set();
  Object.values(courseData.questions).forEach((q) => {
    if (!infofile.hasErrors(q) && q.data?.topic) {
      knownQuestionTopicNames.add(q.data.topic);
    }
  });
  const questionTopicNames = [...knownQuestionTopicNames];

  const params = [
    !infofile.hasErrors(courseData.course),
    deleteUnused,
    courseTopics,
    questionTopicNames,
    courseId,
  ];

  perf.start('sproc:sync_topics');
  await sqldb.callAsync('sync_topics', params);
  perf.end('sproc:sync_topics');
};
